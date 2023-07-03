import { Component } from 'solid-js'
import { setComponentPageTitle } from '../../shared/util'
import { useParams, useSearchParams } from '@solidjs/router'
import { CreateCharacterForm } from './CreateCharacterForm'

// [TODO] remove IDs which is just against html standard and stupid
const premiumoptions = [
  { id: 'true', label: 'Premium' },
  { id: 'false', label: 'Free' },
]
const matchoptions = [
  { id: 'true', label: 'Matchable' },
  { id: 'false', label: 'Hidden' },
]
const animeOptions = [
  { id: 'true', label: 'Anime' },
  { id: 'false', label: 'Realistic' },
]


const CreateCharacter: Component = () => {
  const params = useParams<{ editId?: string; duplicateId?: string }>()
  const [query] = useSearchParams()
  setComponentPageTitle(
    params.editId ? 'Edit character' : params.duplicateId ? 'Copy character' : 'Create character'
  )
  return (
    <CreateCharacterForm
      editId={params.editId}
      duplicateId={params.duplicateId}
      import={query.import}
    />
  )
}

export default CreateCharacter
