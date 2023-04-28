import { REST, Routes }  from 'discord.js'
import  { config } from './config'
import  fs from 'node:fs'
import path from 'node:path'

const {discordToken,discordId} = config

const commands:any = []
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'discord')
//const commandFolders = fs.readdirSync(foldersPath)

	const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'))
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(foldersPath, file)
		const command = require(filePath)
		
        commands.push(command.data.toJSON())
        
	}


// Construct and prepare an instance of the REST module

// and deploy your commands!
(async () => {
	try {
        const rest = await new REST({ version: '10' })
        console.log(discordToken)
        rest.setToken(discordToken)
        
        console.log(`Started refreshing ${commands.length} application (/) commands.`)

		// The put method is used to fully refresh all commands in the guild with the current set
		await rest.put(
            Routes.applicationCommands(discordId),
            { body: commands },
        )

		console.log(`Successfully reloaded ${commands.length} application (/) commands.`)
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error)
	}
})();