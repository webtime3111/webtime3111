const express=require('express');
const {chain, last, forEach}= require('lodash');
const ytdl= require('ytdl-core');
const {validate , Joi} = require('express-validation');
const {spawn} = require('child_process');
const ffmpegPath = require ('ffmpeg-static')

const app = express();

const getResolution = formats =>
chain(formats)
.filter('height')
.map('height')
.uniq()
.orderBy(null, 'desc')
.value();

app.get(
    '/api/video',
    validate({
       query: Joi.object({
           id: Joi.string(). required(),
        }), 
    }),
    (req, res, next) =>{
        const { id } = req.query;
        ytdl.getInfo(id)
        .then(({videoDetails, formats}) => {
            const {title, thumbnails} = videoDetails;

            const thumbnailURL = last(thumbnails).url;

            const resolutions =getResolution(formats);

            res.json({title, thumbnailURL , resolutions});

        })
        .catch((err) => next(err));
    },
);

app.get(
    '/download',
    validate({
        query: Joi.object({
            id: Joi.string().required(),
            format: Joi.valid('video' , 'audio'),
            resolution: Joi.when(
                'format',
                {
                    is: Joi.valid('video'),
                    then:Joi.number().required()
                }
            )
        })
    }),
    (req, res, next)=> {
        const {id, format} = req.query;

        ytdl.getInfo(id)
        .then(({videoDetails, formats}) => {
                const {title} = videoDetails;

                const streams = {};

                if (format === 'video') {

                    const resolution =parseInt(req.query.resolution)

                    const videoFormat = chain(formats)
                    .filter(({height, videoCodec}) => (
                        height === resolution && videoCodec?.startWith('avc1')
                    ))
                    .orderBy('fps', 'desc')
                    .head()
                    .value();

                    streams.video = ytdl(id , {quality: videoFormat.itag});
                    streams.audio = ytdl(id , {quality: 'highestaudio'});
                }
                if (format == 'audio'){
                    streams.audio = ytdl(id, {quality: 'highestaudio'})
                }

                   const pipes ={
                       out:1,
                       err: 2,
                       video:3,
                       audio:4,
                   } 

                const ffmpegInputOptions= {
                    video:[
                        '-i', 'pipe:${pipes.video}',
                        '-i', 'pipe:${pipes.audio}',
                        '-map' , '0:v',
                        '-map' , '1:a',
                        '-c:v' , 'copy',
                        '-c:a' , 'libmp3lame',
                        '-crf' , '27',
                        '-preset' , 'veryfast',
                        '-movflats' , 'frag_ketframe+empty_moov',
                        '-f','mp4_'
                    ],
                    audio:[
                        '-i','pipe:${pipe.audio}',
                        '-c:a','libm3lame',
                        '-vn',
                        '-ar','44100',
                        '-ac','2',
                        '-b:a', '192k',
                        '-f', ',mp3'
                    ]
                }

                const ffmpegOption = [
                    ...ffmpegInputOptions[format],
                    '-loglevel', 'error',
                    '-_'
                ]

                const ffmpegProcess = spawn(
                    ffmpegPath,
                    ffmpegOption,
                    {
                        stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
                    },
               );
                forEach(streams, (stream, format) => {
                    const dest = ffmpegProcess.stdio[pipes[format]]
                    stream.pipe(dest)
                })
                let ffmpegLogs= ''
                ffmpegProcess.stdio[pipes.out].pipe(res);
                ffmpegProcess.stdio[pipes.err].on(
                    'data',
                    (chunk) => ffmpegLogs += chunk.toString(),
                );
                ffmpegProcess.on(
                    'exit',
                    (exitCode)=>{
                        if (exitCode === 1){
                            console.error(ffmpegLogs);
                        }
                        res.end();
                    }
                )
        })
        .catch(err => next(err))
    }
)


const port = 8000;
app.listen(
    port,()=> console.log("Server listing on port ${port}"),
);
