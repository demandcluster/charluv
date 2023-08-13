import { logger } from './logger'
import { store } from './db'
import fs from 'node:fs'
import path from 'node:path'
import { Client, Collection, Events, GatewayIntentBits, TextChannel } from 'discord.js'
import { config } from './config'
//import { connect } from './db/client'
import * as redis from 'redis'

function getUri() {
  let creds = config.redis.user || ''
  if (creds && config.redis.pass) creds += `:${config.redis.pass}`
  if (creds) creds += '@'

  return `redis://${creds}${config.redis.host}:${config.redis.port}`
}
const redisClient = redis.createClient({ url: getUri() })

const checkRedis = async () => {
  await redisClient.connect()
  const result = await redisClient.get('discordBot')
  console.log(result)
  if (result === '1') return '1'
  return result
}
checkRedis()
  .then((result) => {
    if (result === '1') {
      logger.error('Discord bot already running')
      process.exit()
    } else {
      logger.info('checkredis ' + result)
    }
  })
  .catch((error) => {
    // Handle any errors that occur during the Redis operation or Promise resolution
    logger.error('Error occurred while checking Redis: ' + error)
    process.exit()
  })

const { discordToken } = config

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

const commandsPath = path.join(__dirname, 'discord')
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))

client.commands = new Collection()
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file)
  const command = require(filePath)
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    console.log('Module loaded: ' + command.data.name)
    client.commands.set(command.data.name, command)
  } else {
    console.log(
      `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
    )
  }
}

client.on('guildMemberAdd', async (member) => {
  // guildmemberadd is the event which gets triggered if somebody joins your Discord server
  const embed = {
    title: `Welcome to the server, ${member.user.username}!`,
    description: `${member} ${member.guild.memberCount}rd to join, may many follow this great example..`,
    color: 0x00ffff,
    footer: {
      text: `You got an early access code, just in case you needed it...`,
    },
  }
  const greetings = [
    'We have great news',
    'We are happy to have you here',
    'Welcome to the server',
    'So nice you are here',
    'We are happy to see you',
  ]
  // shuffle greeting
  const greeting = greetings[Math.floor(Math.random() * greetings.length)]

  await member.roles.add('1091916813736095754')
  const code = await store.invitecode.getInviteCode()
  if (!code) await member.send('No codes available')
  await member.send(
    `Your Charluv Early Access code is: **${code}**. The code is not exclusive to you and can be used by anyone. Please use it as soon as possible.`
  )
  const channel: TextChannel = client.channels.cache.get('1091959187195559946') as TextChannel
  await channel.send({ content: greeting, embeds: [embed] })
})

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, async (c) => {
  await redisClient.set('discordBot', '1')
  await redisClient.expire('discordBot', 300)
  await redisClient.disconnect()
  console.log(`Ready! Logged in as ${c.user?.tag}`)
  logger.info(false, 'Discord bot ready')

  logger.info(false, 'Database connected')
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const command = interaction.client.commands.get(interaction.commandName)

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`)
    return
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    }
  }
})

logger.info(false, 'Discord connecting')
// Log in to Discord with your client's token
client.login(discordToken)
