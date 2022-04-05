const { WAConnection, MessageType, Presence, Browsers, Mimetype  } = require('@adiwajshing/baileys')
const express = require('express');
const cors = require('cors')
const { body, validationResult } = require('express-validator');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter, mimeToMessageType, reverseNumberFormater } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mimeTypes = require("mime-types");
const port = process.env.PORT || 5000;
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()

const callback_server = "https://wa-api.mitehost.my.id/";

let client

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: false
}));
app.use(cors())

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}


let status = "NOT READY";
let qrcode_return = null;


async function createSession(){
  client = new WAConnection();
  client.version = [3, 3234, 9]
  client.browserDescription = Browsers.macOS("Safari")
  client.connectOptions = {
    maxIdleTimeMs: 60_000,
    maxRetries: 3,
    phoneResponseTime: 15_000,
    connectCooldownMs: 4000,
    alwaysUseTakeover: true,
    queryChatsTillReceived: true
  }
  if (fs.existsSync(SESSION_FILE_PATH)) {
    client.loadAuthInfo(SESSION_FILE_PATH)
  }

  client.on('qr', (qr) => {
    qrcode_return = qr;
    console.log('QR RECEIVED', qr);
  });
  
  client.on ('credentials-updated', () => {
    console.log (`credentials updated!`)
    const authInfo = client.base64EncodedAuthInfo()
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(authInfo, null, '\t'))
    status = "READY";
  });
  
  client.on('close', (err) => {
    // Fired if session restore was unsuccessfull
    if(err.reason == "invalid_session"){
        let sess = SESSION_FILE_PATH;
        if (fs.existsSync(sess)) {
            fs.unlinkSync(sess, function (err) {
                if (err) return console.log(err);
                console.log('Session file deleted!');
            });
        }
    }
    console.error('AUTHENTICATION FAILURE', err.reason);
    status = "NOT READY";
  });

  await client.connect();
}

createSession();



app.get("/status", (req, res) => {
  res.status(200).json({
      status: true,
      msg: status,
      data: {}
  });
});

app.get("/reset", (req, res) => {
  try{
    client.close();
  }catch(e){

  }
  createSession();
  res.status(200).json({
      status: true,
      msg: "reset success",
      data: {}
  });
});

app.get("/deletesess", (req, res) => {
  try{
    client.logout();
  }catch(e){
    
  }
  fs.unlinkSync(SESSION_FILE_PATH, function(err) {
    if(err) return console.log(err);
    console.log('Session file deleted!');
  });
  status = "NOT READY";
  //client.destroy();
  //client.initialize();
  res.status(200).json({
      status: true,
      msg: "delete session success",
      data: {}
  });
});

app.get("/qr", (req, res) => {
  res.status(200).json({
      status: true,
      msg: "mendapatkan qr",
      data: {
          qr: qrcode_return
      }
  });
});

const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isOnWhatsApp(number);
  return isRegistered;
}

// Send message
app.post('/send', jsonParser, [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if(status == "NOT READY"){
      return res.status(500).json({
          status: false,
          msg: 'Whatsapp is not ready',
          data: {}
      });
  }

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      msg: errors.mapped(),
      data: {}
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      msg: 'The number is not registered',
      data: {}
    });
  }

  client.sendMessage(number, message, MessageType.text).then(response => {
    res.status(200).json({
      status: true,
      msg: "Sent",
      data: {response}
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      msg: "Fail To Send",
      data: {err}
    });
  });
});

// Send message
app.post('/cek-nomor', jsonParser, [
  body('number').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if(status == "NOT READY"){
      return res.status(500).json({
          status: false,
          msg: 'Whatsapp is not ready',
          data: {}
      });
  }

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      msg: errors.mapped(),
      data: {}
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    res.status(422).json({
      status: false,
      msg: 'The number is not registered',
      data: {}
    });
  }else{
    res.status(200).json({
      status: true,
      msg: "The number is registered",
      data: {}
    });
  }
});

// Send media
app.post('/send-media', jsonParser, async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;
  let mimetype;
  const attachment = await axios.get(fileUrl, {
      responseType: 'arraybuffer'
  }).then(response => {
      mimetype = response.headers['content-type'];
      return response.data;
  });

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);

  await client.sendMessage(number, attachment , mimeToMessageType(mimetype, MessageType), {
    mimetype: mimetype,
    caption: caption,
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    console.log(err)
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send message to group
// -- Send message !groups to get all groups (id & name)
// -- So you can use that group id to send a message
app.post('/send-group-message', [
  body('id').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const chatId = req.body.id;
  const message = req.body.message;

  client.sendMessage(chatId, message, MessageType.text).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

client.on('chat-update', async chats => {
  if(chats.hasNewMessage == true){
      let message = chats.messages.dict
      message = message[Object.keys(message)[0]]
      if(message.key.fromMe == false){
          let media = await getMediaFromMessage(client, chats)
          let data = {
              id_pesan: {
                id: message.key.id
              },
              nomor: message.key.remoteJid,
              pesan: message.message.conversation,
              media: media
          }
          if(callback_server != ""){
            axios
            .post(callback_server+"receive_msg.php", data)
            .then(res => {
              console.log(`statusCode: ${res.statusCode}`)
              //sole.log(res)
            })
            .catch(error => {
              console.error(error)
            });
          }
          //console.log(chats)
      }
  }
});



app.get("/getChat", async (req, res) => {
  if(status == "NOT READY"){
      return res.status(500).json({
          status: false,
          msg: 'Whatsapp is not ready',
          data: {}
      });
  }else{
    let a = client.chats;
    let b = a.dict
    console.log(b);
    let final = [];
    for (let chat in b) {
        let pesan = await client.loadMessages(chat.jid, 25)
        console.log(pesan)
        final.push(a);
    }
    res.status(200).json({
      status: true,
      response: final
    });
  }  
});

app.get("/getContact", async (req, res) => {
  if(status == "NOT READY"){
      return res.status(500).json({
          status: false,
          msg: 'Whatsapp is not ready',
          data: {}
      });
  }else{
    let c = await client.contacts;
    let final = []
    for(let i in c){
      if(c[i].jid != "status@broadcast"){
        let array = {
          name: c[i].name,
          number: reverseNumberFormater(c[i].jid),
        }
        final.push(array)
      }
    }
    //for (const contact of c) {
    //  let r = JSON.parse(contact);
    //  final.push(r);
    //}
    res.status(200).json({
      status: true,
      response: final
    });
  }  
});

app.get("/getUnsavedContact", async (req, res) => {
  if(status == "NOT READY"){
      return res.status(500).json({
          status: false,
          msg: 'Whatsapp is not ready',
          data: {}
      });
  }else{
    let c = await client.getChats(client);
    let final = c;
    //for (const contact of c) {
    //  let r = JSON.parse(contact);
    //  final.push(r);
    //}
    res.status(200).json({
      status: true,
      response: final
    });
  }  
});

app.get("/getGroup", async (req, res) => {
  if(status == "NOT READY"){
      return res.status(500).json({
          status: false,
          msg: 'Whatsapp is not ready',
          data: {}
      });
  }else{
    final = [];
    getChats(client).then(chat => {
      let c = chat.dict
      for(let key in c){
        if(c[key].jid.endsWith("@g.us")){
          final.push(c[key].name)
        }
      }

      res.status(200).json({
        status: true,
        response: final
      });
    });
    
  }  
});

const findGroupByName = async function(session, name){
  let jid
  let chats = await getChats(session).then(chat => {
      let c = chat.dict
      for(let key in c){
          if(c[key].name == name){
              //console.log(c[key].jid)
              jid = c[key].jid
          }
      }
  })
  return jid
}

// Send message to group
// You can use chatID or group name, yea!
app.post('/send-group', [
  body('id').custom((value, { req }) => {
    if (!value && !req.body.name) {
      throw new Error('Invalid value, you can use `id` or `name`');
    }
    return true;
  }),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  let chatId = req.body.id;
  const groupName = req.body.name;
  const message = req.body.message;

  // Find the group by name
  if (!chatId) {
    const group = await findGroupByName(client, groupName);
    if (!group) {
      return res.status(422).json({
        status: false,
        message: 'No group found with name: ' + groupName
      });
    }
    chatId = group;
  }

  client.sendMessage(chatId, message, MessageType.text).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

const getMediaFromMessage = async function(session, chats){
  const m = chats.messages.all()[0]
  const messageContent = m.message
  if (!messageContent) return
  const messageType = Object.keys (messageContent)[0]
  if (messageType === MessageType.text) {
      return ""
  } else if (messageType === MessageType.extendedText) {
      return ""
  } else if (messageType === MessageType.contact) {
      return ""
  } else if (messageType === MessageType.location || messageType === MessageType.liveLocation) {
      return ""
  } else {
      try {
          //const savedFile = await session.downloadAndSaveMediaMessage(m, './Media/media_in_' + m.key.id)
          const buffer = await session.downloadMediaMessage(m);
          let mime = await FileType.fromBuffer(buffer)
          mime = mime[Object.keys(mime)[1]]
          let data = {
              mimetype: mime,
              data: Buffer.from(buffer).toString('base64')
          }
          return data
      } catch (err) {
          console.log('error in decoding message: ' + err)
      }
  }
}

const getChats = async function(session){
  let res = await session.chats
  return res
}


server.listen(port, function() {
  console.log('App running on *: ' + port);
});
