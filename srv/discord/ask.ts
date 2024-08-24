import { SlashCommandBuilder, Role, PermissionFlagsBits, AttachmentBuilder } from 'discord.js'

import makeDemandRequest from '../demandGPT'

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask any question about Charluv')
    .addStringOption((option) =>
      option.setName('question').setDescription('The question you want to ask').setRequired(true)
    )
    .setDMPermission(false),

  async execute(interaction: any) {
    const question = interaction.options.getString('question')
    const interactionId = interaction.id

    const reply = await makeDemandRequest(question)

    if (!reply) {
      await interaction.reply({
        content: 'Did not get an answer. Please ask a mod.',
        ephemeral: true,
      })
      return
    }
    // Truncate the message to fit within Discord's character limit
    const truncateMessage = (text: string, maxLength = 2000) => {
      return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text
    }

    const formattedReply = truncateMessage(reply, 1700)
    const result = `Question: ${question}\nAnswer: ${formattedReply
      .replace(/['"\\]/g, '\\$&')
      .replace(/#/g, '')}`

    try {
      await interaction.reply({
        allowed_mentions: {
          replied_user: true,
          parse: ['users'],
        },
        content: `${result}`,
        ephemeral: false,
      })
    } catch {
      console.error('Error sending message ' + result)
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    }
  },
}
