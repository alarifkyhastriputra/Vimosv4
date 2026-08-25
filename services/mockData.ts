
import { User, Post } from '../types';

export const initialUsers: User[] = [
  {
    id: 'u1',
    name: 'Aiden Orbit',
    email: 'aiden@vimos.com',
    bio: 'Finding beauty in the absence of color.',
    photoURL: 'https://picsum.photos/200/200?grayscale&random=1',
    followers: ['u2', 'u3'],
    following: ['u2'],
    totalLikes: 450
  },
  {
    id: 'u2',
    name: 'Luna Black',
    email: 'luna@vimos.com',
    bio: 'Architect of darkness. Monochrome enthusiast.',
    photoURL: 'https://picsum.photos/200/200?grayscale&random=2',
    followers: ['u1'],
    following: ['u1', 'u3'],
    totalLikes: 890
  },
  {
    id: 'u3',
    name: 'Grey Wanderer',
    email: 'grey@vimos.com',
    bio: 'Street photography from the soul.',
    photoURL: 'https://picsum.photos/200/200?grayscale&random=3',
    followers: ['u2'],
    following: ['u1'],
    totalLikes: 120
  }
];

export const initialPosts: Post[] = [];
