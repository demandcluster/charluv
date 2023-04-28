import { Router } from 'express'
import { assertValid } from 'frisker'
import { store } from '../db'
import {v4} from 'uuid'
import { loggedIn } from './auth'
import { handle, StatusError } from './wrap'
//import { handleUpload } from './upload'
import {now} from '../db/util'
import { PERSONA_FORMATS } from '../../common/adapters'


const router = Router()

const valid = {
  name: 'string',
  avatar: 'string?',
  scenario: 'string',
  greeting: 'string',
  sampleChat: 'string',
  match: "boolean",
  xp: "number",

  premium: "boolean",
  summary: "string", 
  persona: {
    kind: PERSONA_FORMATS,
    attributes: 'any',
  },
} as const



const getMatches = handle(async (req ) => {
    //console.log(loggedIn())
   
    const {userId}=req?.user||{userId:""}
  const chars = await store.matches.getMatches(userId)
  const ownChars = await store.characters.getCharacters(userId)
  // return all chars that are now in ownChars
    const newChars = chars.filter((char) => {
        return !ownChars.some((ownChar) => {
            return ownChar.parent === char._id
        })
    })

  return { characters: newChars }
})
const createCharacter = handle(async (req) => {
   // const body = await handleUpload(req, { ...valid, persona: 'string' })
  // const userId=params.user?.userId
   const id = req.params.id||""
   const {userId} = req?.user||{userId:""}
   
   const matchChar = await store.matches.getMatch(userId,id)
   const oldId = matchChar?._id.toString()
   const newChar = matchChar
    if (newChar){
        newChar.match=false
        newChar.xp=0
        newChar.parent=oldId
        newChar._id=v4()
        newChar.userId=userId
        newChar.createdAt=now()
        newChar.updatedAt=now()
    }
     if(newChar?._id){
     const char = await store.characters.createCharacter(userId!,newChar)
     return char
     }else{
        return false
     }

  })

router.use(loggedIn)
//router.post('/', createMatch)
router.get('/', getMatches)
router.post('/:id', createCharacter)
//router.post('/:id', editMatch)
//router.get('/:id', getMatch)
//router.delete('/:id', deleteMatch)

export default router
