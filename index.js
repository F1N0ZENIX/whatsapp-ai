import makeWASocket, {
  useMultiFileAuthState
} from '@whiskeysockets/baileys'

import P from 'pino'
import axios from 'axios'
import express from 'express'

const app = express()

app.get('/', (req, res) => {
  res.send(`
    <h1>LinkAi Bot Online</h1>
    <p>Veja o pairing code nos logs do Render.</p>
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

  if (!sock.authState.creds.registered) {

    console.log('Generating Pairing Code...')

    setTimeout(async () => {

      try {

        const code =
          await sock.requestPairingCode(
            process.env.PHONE_NUMBER
          )

        const formatted =
          code?.match(/.{1,4}/g)?.join('-') || code

        console.log('==============================')
        console.log('PAIRING CODE:', formatted)
        console.log('==============================')

      } catch (e) {

        console.log(e)

      }

    }, 10000)

  }

  sock.ev.on('connection.update', ({ connection }) => {

    if (connection === 'open') {

      console.log('BOT ONLINE')

    }

    if (connection === 'close') {

      console.log('RECONNECTING...')

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
          text: 'Use:\n!ia sua pergunta'
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

startBot()
