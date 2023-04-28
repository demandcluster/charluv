import { SlashCommandBuilder,Role,PermissionFlagsBits } from 'discord.js';
import {store} from '../db'


module.exports = {
    data: new SlashCommandBuilder()
        .setName('access')
        .setDescription('Send an early access code to a member')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('The user to send code to')
                .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction: any) {
        const target = interaction.options.getString('target')
        const members = await interaction.guild.members.fetch({ query: target, limit: 1 })
        if (!members.size) {
            return interaction.reply({ content: "User not found", ephemeral: true });
            }
        const member = members?.first()||null
        
        const code = await store.invitecode.getInviteCode()
        if(!code) await interaction.reply({content:"No codes available", ephemeral: true })
        if(code){
            await interaction.reply({content:"Code sent", ephemeral: true })
            await member.send(`Your AIVO.CHAT Early Access code is: **${code}**. The code is not exclusive to you and can be used by anyone. Please use it as soon as possible.`)
        }
    },
};
