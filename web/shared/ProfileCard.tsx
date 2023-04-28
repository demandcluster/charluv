import { Component,For, Show } from 'solid-js'
import { A, useNavigate } from "@solidjs/router"
import { AppSchema } from '../../srv/db/schema'
import { characterStore } from '../../store'
import { PersonStanding, GraduationCap, Heart, Moon, Dumbbell, Briefcase, Leaf, Globe2, Hash, User, ChevronsLeft } from 'lucide-solid'
import { getAssetUrl} from './util'


const ProfileCard: Component<{ character: AppSchema.Character; href: string }> = (props) =>(
  <>
  <Show when={props.character}>
  <div class="flex flex-col flex-wrap xl:flex-nowrap xl:flex-row m-auto">
    
    <div class=" max-w-3xl  w-full md:w-3/4 px-4 mr-auto ml-auto">
      <div class="relative flex flex-col min-w-0 break-words w-full mb-6 shadow-lg rounded-lg  bg-[var(--bg-800)] border-[var(--hl-900)] text-900 ">
          <ChevronsLeft class="absolute w-20 h-20 hover:cursor-pointer  text-white"  onclick={()=> props.navBack() } />
          <img alt="..." src={getAssetUrl(props.character?.avatar)} class="w-full align-middle rounded-t-lg min-h-[100px]"/>
            <div class="z-10 w-full text-right relative md:-mt-16 -mt-12 sm:text-5xl p-2 text-3xl text-white text-shadow -bottom-6 right-4">
              <span class=" font-black ">{props.character?.name}</span> {((props.character.persona?.attributes?.age) ? props.character?.persona?.attributes?.age[0].split(" ")[0] : '')}</div>
          <blockquote class="relative p-8 mb-4">
            <svg preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 583 95" class="absolute left-0 w-full block" style="height:95px;top:-94px">
                <polygon points="-30,95 583,95 583,65" class="text-[var(--bg-800)] fill-current"></polygon>
            </svg>
            <p class="text-md font-light mt-2 mb-4">{props.character?.summary}</p>
            
              <hr class=" mt-8 opacity-40 w-[calc(100%-8rem)] ml-32"/>
              <div class=" relative -ml-3 -top-4  text-shadow inline-block mr-3  "><Leaf class="inline mr-1 w-10 text text-[var(--hl-200)]"/>Sexuality</div>
              <div class=" w-full">
                
            <For each={props.character.persona?.attributes?.sexuality}
                fallback={<div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--bg-900)]" >Prefers not to say</div>}>
                {(sex) => <div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--hl-900)]" >{sex}</div>}
              </For>
              </div>

            <Show when={props.character.persona?.attributes?.body}>
              <hr class=" mt-8 opacity-40 w-[calc(100%-6rem)] ml-24"/>
              <div class=" relative -ml-3 -top-4  text-shadow inline-block mr-3 "><Dumbbell class="inline mr-1 w-10 text-[var(--hl-200)]"/>Body</div>
              <div class=" w-full">
              <For each={props.character.persona?.attributes?.body}>
                {(body) => <div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--hl-900)]" >{body}</div>}
              </For>
              </div>
            </Show>

            <Show when={props.character.persona?.attributes?.likes}>
              <hr class=" mt-8 opacity-40 w-[calc(100%-5rem)] ml-24"/>
              <div class=" relative -ml-3 -top-4  text-shadow inline-block mr-3"><Heart class="inline mr-1 w-10 text-[var(--hl-200)]"/>Likes:</div>
              <div class=" w-full">
              <For each={props.character.persona?.attributes?.likes}>
                {(likes) => <div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--hl-900)]" >{likes}</div>}
              </For>
              </div>
            </Show>

            <Show when={props.character.persona?.attributes?.job}>
              <hr class=" mt-8 opacity-40 w-[calc(100%-5rem)] ml-24"/>
              <div class=" relative -ml-3 -top-4  text-shadow inline-block mr-3"><Briefcase class="inline mr-1 w-10 text-[var(--hl-200)]"/>Job</div>
              <div class=" w-full">
                <div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--hl-900)]" >{props.character.persona?.attributes?.job||""}</div>
              </div>
            </Show>

            <Show when={props.character.persona?.attributes?.zodiac}>
              <hr class=" mt-8 opacity-40 w-[calc(100%-5rem)] ml-24"/>
              <div class=" relative -ml-3 -top-4  text-shadow inline-block mr-3"><Moon class="inline mr-1 w-10 text-[var(--hl-200)]"/>Zodiac sign</div>
              <div class=" w-full">
                <div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--hl-900)]" >{props.character.persona?.attributes?.zodiac||""}</div>
              </div>
            </Show>

            <Show when={props.character.persona?.attributes?.country}>
              <hr class=" mt-8 opacity-40 w-[calc(100%-5rem)] ml-24"/>
              <div class=" relative -ml-3 -top-4  text-shadow inline-block mr-3"><Globe2 class="inline mr-1 w-10 text-[var(--hl-200)]"/>Country</div>
              <div class=" w-full">
                <div class="first-letter:capitalize mx-1 border text-xs inline-block mb-3 p-1 px-2 rounded-xl bg-[var(--hl-900)]" >{props.character.persona?.attributes?.country2||""}</div>
              </div>
            </Show>
          </blockquote>
      </div>
    </div>

    </div>
    
     </Show>
   
   </>
  )

export default ProfileCard