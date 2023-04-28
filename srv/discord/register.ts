import { SlashCommandBuilder,Role } from 'discord.js';
import {store} from '../db'


module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Send your AIVO username and ID to the bot to be granted the appropriate roles')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your username from your profile (not your displayname)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('id')
                .setDescription('Your ID from your profile')
                .setRequired(true))
                .setDMPermission(false),
    async execute(interaction: any) {
        const id = interaction.options.getString('id')
        const username = interaction.options.getString('username')
        const disuser = interaction.user
        const guild = interaction.guild
        if(!guild) {
            await interaction.reply({content:"You can not use this command in a DM", ephemeral: true })
            return
            }
        const member = guild.members.cache.get(disuser.id)
        const roles = member.roles.cache
       

       // const role = guild.roles.cache.find(role => role.name === "Registered")
        const user =  await store.users.getUser(id)
        if(!user)  await interaction.reply({content:"User not found", ephemeral: true })
        if(user?.username!==username) await interaction.reply({content:"User not found", ephemeral: true })
        if(user?.username===username){
            const registeredRole:Role | undefined = guild.roles.cache.find((role:Role) => role.name === 'registered')
            const premiumRole:Role | undefined = guild.roles.cache.find((role:Role) => role.name === 'premium')
               
             member.roles.add(registeredRole)
       
            if(user?.premium===true){
                member.roles.add(premiumRole)
                await interaction.reply({content:"Thank you for being a premium member!", ephemeral: true })
               }
            await interaction.reply({content:"You have been registered!", ephemeral: true })
        }
    },
};