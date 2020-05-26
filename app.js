const express = require('express');
const app = express();
const multer = require('multer');
const path = require('path');
const fs = require('file-system')
const { v4: uuidv4 } = require('uuid');
const { createWorker } = require('tesseract.js');
const worker = createWorker();
const jobQueue = {};
const tessQueue = []

/*
	STRUCTURE FOR jobQueue
	{
		job_ID: {
			status: false;
			url: localhost:8123/api/job_ID
			text: false;
		}
	}

*/

//makes uploads folder on server startup
fs.mkdir(__dirname + '/uploads', (err) => {
	if (err) return ;
})


//analyzes images according to queue
const tesseractAnalysis = async () => {
	if (tessQueue.length) {
		await worker.load();
		await worker.loadLanguage('eng');
		await worker.initialize('eng');
		const result = tessQueue.shift();
		console.log(result)
		const { data: { text } } = await worker.recognize(result.data);
		jobQueue[result.uuid].text = text;
		jobQueue[result.uuid].status = true;
		//await worker.terminate();
	}
	setTimeout(tesseractAnalysis, 1000);
}

tesseractAnalysis();


//makes uuid and checks if uuid already taken
const createUUID= (uuid=uuidv4()) => (uuid in jobQueue) ? createUUID() : uuid

//makes sure only images can be uploaded
const checkFileType = (req, file, cb) => {
	const filetypes = /jpeg|jpg|png/;
	//check ext
	const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
	//check mime
	const mimetype = filetypes.test(file.mimetype);
	req.errors = mimetype && extname ? false : true;
	//req.errors = false;
	cb(null, true)
}

//set storage engine
//timestamp added incase of same file-name uploads
const storage = multer.diskStorage({
	destination: __dirname + '/uploads',
	filename: (req, file, cb) => {
		cb(null, file.originalname + '-' + Date.now() +
		path.extname(file.originalname))
	}
});

const upload = multer({
	storage: storage,
	fileFilter: (req, file, cb) => checkFileType(req, file, cb)
})

app.use('/upload', express.static(__dirname + '/uploads'));
app.use('/', express.static(__dirname + '/uploads'));

//returns obj in queue
app.get('/api/jobs/:jobID', (req, res) => res.json(jobQueue[req.params['jobID']]));

app.get('/jobs/:jobID', (req, res) => {
	res.sendFile(__dirname + '/extracted.html');
})

//allow only images, and file upload at a time
app.post('/upload', upload.array('images'), async (req, res) => {
	if (req.errors) return res.status(400).json('IMAGE FILES ONLY');
	if (req.files.length > 1) return res.status(400).json('ONLY 1 FILE ALLOWED')

	fs.readFile(__dirname + `/uploads/${req.files[0].filename}`, (err, data) => {
		if (err) return res.json('error');
		const uuid = createUUID();
		jobQueue[uuid] = {
			status: false,
			url: `/upload/${req.files[0].filename}`
		}
		tessQueue.push({data, uuid})
		res.json(`localhost:8123/jobs/${uuid}`)
	});
});


app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))

app.listen(process.env.PORT || 8123);
