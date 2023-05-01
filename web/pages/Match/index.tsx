import { Route } from '@solidjs/router'
import {Component} from 'solid-js'
import MatchSwipe from './MatchSwipe'
import MatchList from './MatchList'
import MatchProfile from './MatchProfile'

const MatchRoutes: Component = () => (
  <Route path="/likes">
  <Route path="/list" component={MatchSwipe} />
    <Route path="/:id/profile" component={MatchProfile} />
    </Route>

)

export default MatchRoutes
