const http = require('http')
const url = require('url')
const fs = require('fs')
const path = require('path')

const PORT = 8888

const mime = {
  html: 'text/html;charset=UTF-8',
  wasm: 'application/wasm',
}

http
  .createServer((request, response) => {
    let realPath = path.join(__dirname, `.${url.parse(request.url).pathname}`)
    fs.access(realPath, fs.constants.R_OK, (err) => {
      if (err) {
        response.writeHead(404, {
          'Content-Type': 'text/plain',
        })
        response.end()
      } else {
        fs.readFile(realPath, 'binary', (err, file) => {
          if (err) {
            response.writeHead(500, {
              'Content-Type': 'text/plain',
            })
            response.end()
          } else {
            let ext = path.extname(realPath)
            ext = ext ? ext.slice(1) : 'unknown'
            let contentType = mime[ext] || 'text/plain'
            response.writeHead(200, {
              'Content-Type': contentType,
            })

            response.write(file, 'binary')
            response.end()
          }
        })
      }
    })
  })
  .listen(PORT)
console.log('Server is runing at port: ' + PORT + '.')
