import { AppSchema } from '../../srv/db/schema'
import { api } from './api'
import { createStore } from './create'
import { toastStore } from './toasts'

type Scenariosstate = {
  scenarios: {
    loaded: boolean
    charId: string
    list: AppSchema.Scenario[]
  }
}

export const scenarioStore = createStore<Scenariosstate>('Scenario', {
  scenarios: { loaded: false, list: [] },
})((get, set) => {
  return {
    async *getScenarios(state,charId: string) {
        if (state.loading) return
  
        yield { loading: true }
       
        const res = await api.get(`/scenarios/${charId}`)
        yield { loading: false }
  
        if (res.error) toastStore.error('Failed to retrieve scenarios')
        if (res.result) {
          return { scenarios: { list: res.result.scenarios, loaded: true } }
        }
      },
    async createScenario(_,charId: string, payload: AppSchema.Scenario) {
       // if (state.loading) return
  
        //yield { loading: true }
        console.log('creating stuff',charId)
       
        const res = await api.post(`/scenarios/${charId}`,payload)
     //   yield { loading: false }
        if (res.error) toastStore.error('Failed to save scenarios')
        if (res.result) {
          return { scenarios: { list: res.result.scenarios, loaded: true } }
        }
      },
  }})

    
     