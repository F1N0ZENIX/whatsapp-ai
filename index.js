import express from 'express'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys'

import P from 'pino'
import axios from 'axios'
import qrcode from 'qrcode-terminal'

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

    try {

      const fallback = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'qwen/qwen3-32b:free',
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

      return fallback.data.choices[0].message.content

    } catch {

      return 'Erro na IA.'

    }

  }

}

async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, qr }) => {

    if (qr) {
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('BOT ONLINE')
    }

    if (connection === 'close') {
      startBot()
    }

  })

  sock.ev.on('messages.upsert', async ({ messages }) => {

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
      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text: 'Faça uma pergunta.'
        }
      )
      return
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

const app = express()

app.get('/', (req, res) => {
  res.send('Bot online')
})

app.listen(process.env.PORT || 3000, () => {
  console.log('Web server running')
})

startBot()
