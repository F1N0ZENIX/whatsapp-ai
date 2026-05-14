import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'

import express from 'express'
import P from 'pino'
import QRCode from 'qrcode'
import axios from 'axios'

const app = express()

let qrCodeData = 'Carregando QR...'

app.get('/', async (req, res) => {

  if (!qrCodeData.startsWith('data:image')) {

    return res.send(`
      <body style="font-family:sans-serif;text-align:center">
        <h1>${qrCodeData}</h1>
        <p>Atualize a página em alguns segundos.</p>
      </body>
    `)

  }

  res.send(`
    <body style="font-family:sans-serif;text-align:center">
      <h1>Escaneie o QR</h1>
      <img src="${qrCodeData}" />
    </body>
  `)

})

app.listen(process.env.PORT || 3000, () => {
  console.log('Web server running')
})

async function askAI(prompt) {

  try {

    console.log('SENDING TO OPENROUTER:', prompt)

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('AI RESPONSE RECEIVED')

    return response.data.choices[0].message.content

  } catch (err) {

    console.log(
      'OPENROUTER ERROR:',
      err.response?.data || err.message
    )

    try {

      console.log('TRYING FALLBACK MODEL')

      const fallback = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'mistralai/mistral-7b-instruct:free',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      )

      console.log('FALLBACK RESPONSE RECEIVED')

      return fallback.data.choices[0].message.content

    } catch (err2) {

      console.log(
        'FALLBACK ERROR:',
        err2.response?.data || err2.message
      )

      return 'Erro na IA.'

    }

  }

}

async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState('./session')

  const { version } =
    await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({
    connection,
    qr
  }) => {

    if (qr) {

      console.log('QR RECEIVED')

      qrCodeData = await QRCode.toDataURL(qr)

    }

    if (connection === 'open') {

      console.log('BOT ONLINE')

      qrCodeData = 'BOT ONLINE'

    }

    if (connection === 'close') {

      console.log('RECONNECTING...')

      startBot()

    }

  })

  sock.ev.on('messages.upsert', async ({
    messages
  }) => {

    const msg = messages[0]

    if (!msg.message) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    console.log('MESSAGE:', text)

    if (!text.startsWith('!ia')) return

    console.log('IA COMMAND DETECTED')

    const pergunta =
      text.replace('!ia', '').trim()

    if (!pergunta) {

      return sock.sendMessage(
        msg.key.remoteJid,
        {
          text: 'Use !ia pergunta'
        }
      )

    }

    await sock.sendMessage(
      msg.key.remoteJid,
      {
        text: 'Pensando...'
      }
    )

    const resposta = await askAI(pergunta)

    console.log('FINAL RESPONSE:', resposta)

    await sock.sendMessage(
      msg.key.remoteJid,
      {
        text: resposta
      }
    )

  })

}

startBot()
