document.addEventListener('DOMContentLoaded', async () => {
  let video = document.querySelector('.video')
  let fpsNumDisplayElement = document.querySelector('.fps-num')
  let canvas = document.querySelector('.canvas')
  let context2D = canvas.getContext('2d')
  let clientX, clientY

  const STATUS = ['STOP', 'JSWorker', 'WASM', 'WebGL']
  let globalStatus = 'STOP'

  // 计算每一帧用时的数组
  const jsTimeRecords = [],
    wasmTimeRecords = [],
    webGLTimeRecords = []

  // 加载 wasm
  let { instance } = await WebAssembly.instantiateStreaming(fetch('./dip.wasm'))
  let { cppConvFilter, cppGetDataPtr, memory } = instance.exports
  console.log(instance)

  // 自动播放视频
  let promise = video.play()
  if (promise !== undefined) {
    promise.catch((error) => {
      console.error('Can not autoplay!')
    })
  }

  // 初始化 canvas
  video.addEventListener('loadeddata', () => {
    // 设置 canvas 宽高
    canvas.setAttribute('height', video.videoHeight)
    canvas.setAttribute('width', video.videoWidth)
    clientX = canvas.clientWidth
    clientY = canvas.clientHeight

    // 开始绘制
    draw(context2D)
  })

  // 添加 button 响应
  document.querySelector('button').addEventListener('click', () => {
    globalStatus =
      STATUS[
        Number(document.querySelector("input[name='options']:checked").value)
      ]
  })

  function draw() {
    const timeStart = performance.now()
    context2D.drawImage(video, 0, 0)

    // 获取当前帧数据
    pixels = context2D.getImageData(0, 0, video.videoWidth, video.videoHeight)
    switch (globalStatus) {
      case 'JSWorker': {
        pixels.data.set(toGreyJS(pixels.data, clientX, clientY))
        break
      }
      case 'WASM': {
        pixels.data.set(toGreyWasm(pixels.data, clientX, clientY))
        break
      }
    }

    // 绘制数据到 canvas
    context2D.putImageData(pixels, 0, 0)
    // 计算绘制用时
    let timeUsed = performance.now() - timeStart

    // 更新绘制用时
    switch (globalStatus) {
      case 'JSWorker': {
        jsTimeRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(jsTimeRecords)
        break
      }
      case 'WASM': {
        wasmTimeRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(wasmTimeRecords)
        break
      }
      default:
        wasmTimeRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(wasmTimeRecords)
    }

    // 绘制下一帧
    requestAnimationFrame(draw)
  }

  function calcFPS(vector) {
    const AVERAGE_RECORDS_COUNT = 100
    if (vector.length > AVERAGE_RECORDS_COUNT) {
      vector.shift(-1)
    } else {
      return 'NaN'
    }
    let averageTime =
      vector.reduce((pre, item) => {
        return pre + item
      }, 0) / Math.abs(AVERAGE_RECORDS_COUNT)
    return (1000 / averageTime).toFixed(2)
  }

  // 普通 JS 处理
  function toGreyJS(data, width, height) {
    for (let i = 0; i < width * height * 4; i += 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        a = data[i + 3]

      // 对RGB通道进行加权平均
      const v = 0.2126 * r + 0.7152 * g + 0.0722 * b
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = a
    }
    return data
  }

  // WASM 处理
  // filters functions.
  const dataOffset = cppGetDataPtr()
  let Uint8View = new Uint8Array(memory.buffer)

  function toGreyWasm(pixelData, width, height) {
    const arLen = pixelData.length

    Uint8View.set(pixelData, dataOffset)
    // core.
    cppConvFilter(width, height)
    // retrieve data.
    return Uint8View.subarray(dataOffset, dataOffset + arLen)
  }
})
