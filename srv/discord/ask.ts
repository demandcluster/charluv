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

    await interaction.deferReply({
      allowed_mentions: {
        replied_user: true,
        parse: ['users'],
      },
      ephemeral: false,
    })

    const reply = await makeDemandRequest(question)

    if (!reply) {
      await interaction.editReply('Did not get an answer. Please ask a mod.')
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
      await interaction.editReply(result)
    } catch {
      console.error('Error sending message ' + result)
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    }
  },
}
