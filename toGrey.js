self.onmessage = ({ data }) => {
  const { array, start, end } = data
  const view = new Uint8Array(array)

  for (let i = start; i < end; i += 1) {
    const r = view[i * 4],
      g = view[i * 4 + 1],
      b = view[i * 4 + 2],
      a = view[i * 4 + 3]

    // // 对RGB通道进行加权平均
    const v = 0.2126 * r + 0.7152 * g + 0.0722 * b
    view[i * 4] = v
    view[i * 4 + 1] = v
    view[i * 4 + 2] = v
    view[i * 4 + 3] = a
  }

  // console.log(view[0])
  // view[0] = 12
  // console.log(view[0])

  self.postMessage('1')
}
