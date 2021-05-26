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
