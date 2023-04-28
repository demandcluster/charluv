import { ParentComponent, ParentProps } from 'solid-js';
import type { _SwipeCardProps } from './types';
import { _createSwipeCard } from './createSwipeCard';
// console.log("_SwipeCardProps",_SwipeCardProps);
export const _SwipeCard: ParentComponent<_SwipeCardProps> = (initialProps: ParentProps<_SwipeCardProps>) => {
    const { element } = _createSwipeCard(initialProps);

    return element;
};
