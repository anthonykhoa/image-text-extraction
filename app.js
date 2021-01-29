const express = require('express')
const app = express()
const multer = require('multer')
const path = require('path')
const fs = require('file-system')
const { v4: uuidv4 } = require('uuid')
const { createWorker } = require('tesseract.js')
const worker = createWorker()
const jobID_map = {}
const tessQueue = []

/*
	STRUCTURE FOR jobQueue
	{
		job_ID: [{
			status: false;
			url: localhost:8123/jobs/job_ID
			text: false;
		}],
		
		job_ID: [{file}, {file}, {file}]
	}


	tessQueue is an array of arrays
*/

//makes uploads folder on server startup
fs.mkdir(__dirname + '/uploads', (err) => {
  if (err) return
})

const processTess = async (result, uuid) => {
  let index = 0
  while (index !== result.length) {
    await worker.load()
    await worker.loadLanguage('eng')
    await worker.initialize('eng')
    const {
      data: { text },
    } = await worker.recognize(result[index])
    jobID_map[uuid][index].text = text
    jobID_map[uuid][index].status = true
  }
}

//analyzes images according to queue
const tesseractAnalysis = async () => {
  if (tessQueue.length) {
    const result = tessQueue.shift()
    await processTess(result, result.uuid)
  }
  setTimeout(tesseractAnalysis, 1000)
}

tesseractAnalysis()

//makes uuid and checks if uuid already taken
const createUUID = (uuid = uuidv4()) =>
  uuid in jobID_map ? createUUID() : uuid

//makes sure only images can be uploaded
const checkFileType = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png/
  //check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase())
  //check mime
  const mimetype = filetypes.test(file.mimetype)
  req.errors = mimetype && extname ? false : true
  //req.errors = false;
  cb(null, true)
}

//set storage engine
//timestamp added incase of same file-name uploads
const storage = multer.diskStorage({
  destination: __dirname + '/uploads',
  filename: (_, file, cb) => {
    cb(
      null,
      file.originalname + '-' + Date.now() + path.extname(file.originalname)
    )
  },
})

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => checkFileType(req, file, cb),
})

app.use('/upload', express.static(__dirname + '/uploads'))
app.use('/', express.static(__dirname + '/uploads'))

//returns obj in queue
app.get('/api/jobs/:jobID', (req, res) =>
  res.json(jobID_map[req.params['jobID']])
)

app.get('/jobs/:jobID', (req, res) => {
  res.sendFile(__dirname + '/extracted.html')
})

//allow only images
app.post('/upload', upload.array('images'), async (req, res) => {
  if (req.errors) return res.status(400).json('IMAGE FILES ONLY')

  const uuid = createUUID()
  jobID_map[uuid] = []
  tessQueue.push([])
  //set uuid property to the array in queue
  tessQueue[tessQueue.length - 1].uuid = uuid
  req.files.forEach((file) => {
    fs.readFile(__dirname + `/uploads/${file.filename}`, (err, data) => {
      if (err) return res.json('error')
      jobID_map[uuid].push({
        status: false,
        url: `/upload/${file.filename}`,
      })
      tessQueue[tessQueue.length - 1].push(data)
    })
  })
  res.json(`localhost:${process.env.PORT || 8123}/jobs/${uuid}`)
})

app.get('/', (_, res) => res.sendFile(__dirname + '/index.html'))

app.listen(process.env.PORT || 8123)
