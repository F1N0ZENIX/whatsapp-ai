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

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat-v3-0324:free',
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

    return response.data.choices[0].message.content

  } catch {

    return 'Erro na IA.'

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

    if (!text.startsWith('!ia')) return

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

    await sock.sendMessage(
      msg.key.remoteJid,
      {
        text: resposta
      }
    )

  })

}

startBot()
