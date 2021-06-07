document.addEventListener('DOMContentLoaded', async () => {
  let video = document.querySelector('.video')
  let fpsNumDisplayElement = document.querySelector('.fps-num')
  let canvas = document.querySelector('.canvas')
  let context2D = canvas.getContext('2d')

  let canvasNone = document.querySelector('.canvasNone')
  let contextNone2D = canvasNone.getContext('2d')
  let clientX, clientY

  const STATUS = ['STOP', 'JS', 'WASM', 'JSWorker', 'WebGL']
  let globalStatus = 'STOP'

  // 计算每一帧用时的数组
  const jsTimeRecords = [],
    wasmTimeRecords = [],
    jsWorkerTimeRecords = [],
    webglRecords = []

  // 初始化 canvas
  video.addEventListener('loadeddata', () => {
    console.log('视频加载完毕')

    // 设置 canvas 宽高
    canvas.setAttribute('height', video.videoHeight)
    canvas.setAttribute('width', video.videoWidth)
    canvasNone.setAttribute('height', video.videoHeight)
    canvasNone.setAttribute('width', video.videoWidth)
    clientX = canvas.clientWidth
    clientY = canvas.clientHeight

    // 开始绘制
    draw(context2D)
  })

  // 加载 wasm
  let { instance } = await WebAssembly.instantiateStreaming(fetch('./dip.wasm'))
  let { cppConvFilter, cppGetDataPtr, memory } = instance.exports

  // 自动播放视频
  let promise = video.play()
  if (promise !== undefined) {
    promise.catch((error) => {
      console.error('Can not autoplay!')
    })
  }

  // 添加 button 响应
  document.querySelector('button').addEventListener('click', () => {
    globalStatus =
      STATUS[
        Number(document.querySelector("input[name='options']:checked").value)
      ]
  })

  async function draw() {
    const timeStart = performance.now()
    // 讲视频的帧绘制到隐藏的图片中
    contextNone2D.drawImage(video, 0, 0)

    // 获取当前帧数据
    const pixels = contextNone2D.getImageData(
      0,
      0,
      video.videoWidth,
      video.videoHeight
    )
    switch (globalStatus) {
      case 'JS': {
        pixels.data.set(toGreyJS(pixels.data, clientX, clientY))
        break
      }
      case 'WASM': {
        pixels.data.set(toGreyWasm(pixels.data, clientX, clientY))
        break
      }
      case 'JSWorker': {
        pixels.data.set(await toGreyJSWorker(pixels.data, clientX, clientY))
        break
      }
    }

    if (globalStatus === 'WebGL') {
      canvas.setAttribute('style', 'filter: grayscale(100%);')
    } else {
      canvas.setAttribute('style', '')
    }

    // 绘制数据到 canvas
    context2D.putImageData(pixels, 0, 0)
    // 计算绘制用时
    let timeUsed = performance.now() - timeStart

    // 更新绘制用时
    switch (globalStatus) {
      case 'JS': {
        jsTimeRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(jsTimeRecords)
        break
      }
      case 'WASM': {
        wasmTimeRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(wasmTimeRecords)
        break
      }
      case 'JSWorker': {
        jsWorkerTimeRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(jsWorkerTimeRecords)
        break
      }
      case 'WebGL': {
        webglRecords.push(timeUsed)
        fpsNumDisplayElement.innerHTML = calcFPS(webglRecords)
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
    const AVERAGE_RECORDS_COUNT = 20
    if (vector.length > AVERAGE_RECORDS_COUNT) {
      vector.shift(-1)
    } else {
      return 'Calculating'
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

  // 普通 JS 多线程
  function toGreyJSWorker(data, width, height) {
    return new Promise((resolve, reject) => {
      const sharedArray = new SharedArrayBuffer(width * height * 4)
      const view = new Uint8Array(sharedArray, 0)
      view.set(data)

      const workNums = navigator.hardwareConcurrency
      let finishCount = 0
      const perSize = (width * height) / workNums
      const onMessage = () => {
        finishCount++
        if (finishCount === workNums) {
          resolve(view)
        }
      }

      for (let i = 0; i < workNums; i++) {
        const myWorker = new Worker('./toGrey.js')
        myWorker.onmessage = onMessage
        myWorker.postMessage({
          array: sharedArray,
          start: i * perSize,
          end: (i + 1) * perSize,
        })
      }
    })
  }

  // WASM 处理
  // 获取 C/C++ 中存有帧像素数据的数组，在 Wasm 线性内存段中的偏移位置
  const dataOffset = cppGetDataPtr()
  // 为 Wasm 模块的线性内存段设置用于进行数据操作的视图
  let Uint8View = new Uint8Array(memory.buffer)
  function toGreyWasm(pixelData, width, height) {
    const len = pixelData.length
    // 填充当前帧画面的像素数据
    Uint8View.set(pixelData, dataOffset)
    // 调用灰度化处理函数
    cppConvFilter(width, height)
    // 返回经过处理的数据
    return Uint8View.subarray(dataOffset, dataOffset + len)
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
})
