import { SlashCommandBuilder, Role, PermissionFlagsBits, AttachmentBuilder } from 'discord.js'

import { makeDemandRequest } from '../demandGPT'

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

    await interaction.reply({
      allowed_mentions: {
        replied_user: true,
        parse: ['users'],
      },
      content: reply,
      ephemeral: false,
    })
  },
}
