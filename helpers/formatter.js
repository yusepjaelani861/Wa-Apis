const phoneNumberFormatter = function(number) {
  // 1. Menghilangkan karakter selain angka
  let formatted = number.replace(/\D/g, '');

  // 2. Menghilangkan angka 0 di depan (prefix)
  //    Kemudian diganti dengan 62
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substr(1);
  }

  if (!formatted.endsWith('@c.us')) {
    formatted += '@c.us';
  }

  return formatted;
}

function mimeToMessageType(mime, msg_type){
  if(mime == "image/jpeg"){
      return msg_type.image
  }else if(mime == "image/png"){
      return msg_type.image
  }else if(mime == "image/jpg"){
      return msg_type.image
  }else if(mime == "video/mp4"){
      return msg_type.video
  }else if(mime == "audio/mpeg"){
      return msg_type.audio
  }else{
      return msg_type.document
  }
}

function reverseNumberFormater(number){
  if (number.endsWith('@s.whatsapp.net')) {
      let n = number.split("@");
      number = n[0]

      if (number.startsWith('62')) {
          number = '0' + number.substr(2);
      }
  }
  return number
}

module.exports = {
  phoneNumberFormatter,
  mimeToMessageType,
  reverseNumberFormater
}