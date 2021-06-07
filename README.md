# 前端视频计算对比

本实验通过实现简单的 RGB to Grey 算法，在原生 JS、WebAssembly、JS Worker 多线程、CSS Filter (GPU 并行加速)几种环境下进行性能对比。

# 快速开始

1. 开启本地 `node` 服务器

```
 node node-wasm-server.js
```

2. 使用浏览器打开 http://localhost:8888/index.html ，建议使用 **Chrome** 浏览器

# 实验报告

在线系统: https://parallel.kaiyi.cloud/  
源代码: https://github.com/Kaiyiwing/parallel_hw

### 背景

图像灰度化是相对容易的图像算法，因其对像素的处理不需要考虑其他像素的数据，也很适合进行并行计算。

本章节的另一个背景为，随着 Web 应用的发展，越来越多重型应用实现 Web 化，已经实现商业化的如目前在市场上占据绝对优势的设计工具 Figma、协作知识库工具 Notion 等。因基于 Web 的应用天然具有便于访问、适合多人协作的特性，越来越多的公司尝试将软件 Web 化，例如图像编辑甚至是视频编辑重构到 Web 领域。

JavaScript 作为动态语言天然性能较差，随着 Chrome V8 引擎将 JIT 编译技术引入到 JS 引擎中，极大的的提高了 JavaScript 的运行速度。即使 V8 引擎对 JavaScript 进行了极其优秀的优化，但由于浏览器的特殊性，JS 与物理机之间依旧隔着 V8 引擎这一层，无法直接调用物理机的性能。综上所述，JavaScript 性能距离支撑高强度的 Web 应用还有一定的距离，故前端领域诞生了多种提升性能的方式。本次实验通过使用不同方式实现图像灰度化来对比不同方式的性能对比。

### 实验环境搭建

本次实验对比的素材为实时灰度化一段视频，对比输出帧率。实验界面如下图所示。
![](https://i.imgur.com/5pLMk9G.jpg)  
帧率计算会采用最近 20 帧渲染时间取平均数作为帧率，可以一定程度去除偶然现象导致的结果不稳定。其计算逻辑代码如下：

```javascript
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
```

每次从视频中获取一帧绘制在隐藏的 canvas 画板中，通过 `getImageData` 获取光栅化后的数据，作为灰度化数据的原始素材。其基本逻辑如下：

```javascript
// 将视频的帧绘制到隐藏的 canvas 中
contextNone2D.drawImage(video, 0, 0)

// 获取当前帧光栅化后的数据
const pixels = contextNone2D.getImageData(
  0,
  0,
  video.videoWidth,
  video.videoHeight
)
```

接下来，将使用不同的方法对当前光栅化后的数据进行处理，并绘制到用户可见的 canvas 上，最后形成灰度化后的视频。

测试环境为：  
MacBook Pro (15-inch, 2019)  
CPU: 2.6 GHz six cores Intel Core i7  
Memory: 16 GB 2400 MHz DDR4  
GPU: Radeon Pro 555X 4 GB

### 原生 JavaScript 实现

原生的 JavaScript 实现相对简单，只需要将原图像的 R、G、B 通道取出，根据人眼对三种颜色的敏感度进行混合，本次实验中采用的参数为 `0.2126 * r + 0.7152 * g + 0.0722 * b`  
其代码实现逻辑如下:

```javascript
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
```

### WebAssembly 实现

WebAssembly 是一个相对试验性的 API，目前已经得到 W3C 的推荐，与 HTML，CSS 和 JavaScript 一起，成为 Web 的第四种语言。 其是一种低层次的编程语言类似于 Java 虚拟机中 Java 字节码的存在，可以由 C/C++、RUST 等常见语言编译而来，再藉虚拟机引擎在浏览器内运行。从严谨的角度来定义，“WebAssembly 是基于栈式虚拟机的虚拟二进制指令集（V-ISA），它被设计为高级编程语言的可移植编译目标”。

WASM 能够给 Web 应用更高效的使用物理机 CPU 的能力，让 Web 应用具有更高的性能，甚至让 Web 应用能够与原生应用展开竞争。所以我们十分兴奋 WASM 能够给前端世界带来什么样的变化，事实上现在很多 Web 应用已经开始使用 WASM 开始提高性能。

本次实验中，我们使用 C++ 作为实现语言，通过 Emscripten 编译为 WASM 模块。Emscripten 的实现原理非常简单，其将 C/C++ 源代码转换为 LLVM IR，这个过程中其直接使用了 Clang 的编译器前端，然后将 LLVM IR 转换为 WASM。

这里，我们需要先使用 C++ 实现图像灰度化的代码，其代码逻辑如下：

```cpp
#include <emscripten.h>
#include <cmath>

// 储存每一帧对应的像素点数据
unsigned char data[921600];

// 将被导出的函数，放置在 extern "C" 中防止 Name Mangling；
extern "C" {
  // 获取帧像素数组的首地址
  EMSCRIPTEN_KEEPALIVE auto* cppGetDataPtr() { return data; }
  // 滤镜函数
  EMSCRIPTEN_KEEPALIVE void cppConvFilter(int width, int height) {
    for (int i = 0; i < width * height * 4; i += 4) {
      int r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        a = data[i + 3];

        // 对RGB通道进行加权平均
      int v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = a;
    }
  }
}

```

其计算逻辑与 JavaScript 版本基本一致，这里我们需要注意的是，我们使用了 `EMSCRIPTEN_KEEPALIVE`, 我们能够确保被“标记”的函数不会在编译器的编译过程中，被 DCE（Dead Code Elimination）过程处理掉。

之后我对使用 emcc 对其进行编译：

```shell=
emcc dip.cc -s WASM=1 -O3 --no-entry -o dip.wasm
```

这里我们通过 “-s” 参数，为 emcc 指定了编译时选项 “WASM=1”。该选项可以让 emcc 将输入的 C/C++ 源码编译为对应的 Wasm 格式目标代码。同时，我们还指定了产出文件的格式为 “.wasm”，告诉 Emscripten 我们希望以 “Standalone” 的方式来编译输入的 C/C++ 源码。“–no-entry” 参数告诉编译器，我们的 Wasm 模块没有声明 “main” 函数，因此不需要与 CRT（C Runtime Library）相关的功能进行交互。

这样 Emscripten 便会为我们生成一个可以直接在浏览中使用的 WASM 模块。

为了能在 JavaScript 使用该模块，我们需要在 JavaScript 引入该模块:

```javascript
// 加载 wasm
let { instance, module } = await WebAssembly.instantiateStreaming(
  fetch('./dip.wasm')
)
let { cppConvFilter, cppGetDataPtr, memory } = instance.exports
```

可以看到，通过 fetch 方法返回的 Respose 对象上的 arrayBuffer 函数，会将请求返回的内容解析为对应的 ArrayBuffer 形式。而这个 ArrayBuffer ，随后便会作为 WebAssembly.instantiate 方法的实际调用参数。

函数返回的 Promise 对象在被 resolve 之后，我们可以得到对应的 WebAssembly.Instance 实例对象和 WebAssembly.Module 模块对象（这里分别对应到名为 instance 和 module 的属性上）。然后在名为 instance 的变量中，我们便可以获得从 Wasm 模块导出的所有方法。

上面的代码除了从 instance.exports 对象中导出了定义在 Wasm 模块内的函数以外，还有另一个名为 memory 的对象。这个 memory 对象便代表着模块实例所使用到的线性内存段。线性内存段在 JavaScript 中的表示形式，也就是我们上文中提到的，是一个 ArrayBuffer 对象。当然，这里 memory 实际上是一个名为 WebAssembly.Memory 的包装类对象，而该对象上的 “buffer” 属性中，便实际存放着对应模块线性内存的 ArrayBuffer 对象。

在加载完 WASM 模块，并获得了其导出的方法后，便可以在我们的 JavaScript 逻辑中使用它。

```javascript
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
```

于是我们就完成了，使用 WebAssembly 处理图像灰度化的逻辑。

### JavaScript Worker

众所周知 JavaScript 是一个单线程的模型，这就导致了当我们的计算阻塞了唯一的线程后，页面也就无法响应用户的操作，为了支撑大规模的应用，前端需要多线程的支持。 JavaScript Worker 应运而生，这里我们使用 JavaScript Worker 多线程对图像进行灰度化处理。

首先是我们实验 worker 线程的代码逻辑，主线程会将原始数据、数据操作的起点、终点发送给 worker 线程，worker 线程在自己的线程中进行计算。这里为了减少数据拷贝时导致的性能损耗，我们采用 Shared Array Buffer 来进行主线程和 worker 线程的通信。其代码逻辑如下:

```javascript
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

  self.postMessage('完成')
}
```

这里逻辑相对简单，当 worker 线程接收到数据后便开始对分配给自己的任务进行计算，计算完成后便通知主线程。

在讲主线程代码前，我们先介绍一个 API ：`navigator.hardwareConcurrency`, 其可以有效的获得用户物理机推荐的线程数，使用其作为我们生成的 worker 线程数，可以适配不同的机器，避免生成过多或者过少的线程导致不能充分利用物理机的性能。其代码逻辑为：

```javascript
function toGreyJSWorker(data, width, height) {
  return new Promise((resolve, reject) => {
    // 将帧数据放置到 SharedArrayBuffer 中
    const sharedArray = new SharedArrayBuffer(width * height * 4)
    const view = new Uint8Array(sharedArray, 0)
    view.set(data)

    const workNums = navigator.hardwareConcurrency
    let finishCount = 0
    const perSize = (width * height) / workNums
    // 计算完成任务的 worker 线程，都完成计算后 resolve
    const onMessage = () => {
      finishCount++
      if (finishCount === workNums) {
        resolve(view)
      }
    }
    // 根据 workNums 的数量生成 worker 线程
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
```

JavaScript Worker 的实现逻辑基本与 JavaScript 原生版本一致，其主要不同在于将任务分配给了多个线程进行计算。

### CSS Filter GPU 并行渲染

除了通过 WebAssembly 调用物理机的 CPU 性能外，前端还可以使用 WebGL 直接调用物理机 GPU 的性能。对于图像灰度化这种非常适合并行运算的算法，显然 GPU 更加适合这种情况。

这里我们采用极度取巧的方式调用 WebGL 的方式，便是使用 CSS Filter API，因为对于浏览器来说，为了提高 CSS Filter 的性能，浏览器使用 WebGL 来实现以提高性能。事实上直接使用 CSS Filter 可能比手动使用 WebGL 实现性能会更好一些，因为浏览器对 CSS 相关计算做了进一步的优化。

代码逻辑上比较简单，我们给 Canvas 添加了 CSS Filter 相关属性：

```css
filter: grayscale(100%);
```

### 性能对比

在上文我们对四种方案进行实现后，我们就可以使用帧数对这四种方案进行对比，事实上结果与我们的预期有一定的相符合又不太相符。 这里我们先看结果。

#### 原始视频（未灰度）

![](https://i.imgur.com/F7RZWSt.jpg)

#### 使用 JavaScript 渲染

![](https://i.imgur.com/ztoaaZ5.png)

#### 使用 WebAssembly 渲染

![](https://i.imgur.com/psvyvjf.png)

#### 使用 JS Worker 渲染

![](https://i.imgur.com/BeUWNNW.png)

#### 使用 CSS Filter 渲染

![](https://i.imgur.com/gC8AtyO.png)

#### 对比分析

我们可以明显的发现，WebAssembly、CSS Filter 对比原生 JavaScript 都有显著的提升，但是 JavaScript Worker 性能非常差，对于我的机器，`navigator.hardwareConcurrency` 值为 12，所以会使用 12 个 worker 线程计算。

因为 JavaScript 语言的特性，工作者线程有自己独立的事件循环、全局对象、事件处理程序和其他 JavaScript 环境必需的特性。创建这些结构的代价不容忽视，所以对于轻度的任务创建工作者线程可能是非常不必要的。

通常，工作者线程应该是长期运行的，启动成本比较高，每个实例占用的内存也比较大。所以对于 JavaScript 其多线程编程可能与常规的多线程模型不太一样，多线程可能更多的应用于后台运行比较耗时的任务，而不是用于并行计算来提高性能。

而对于 WebAssembly、CSS Filter，我们可以看到其性能提升非常明显，有效的提高了 JavaScript 进行复杂计算的性能。
