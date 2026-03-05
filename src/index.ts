import { greetUser } from '$utils/greet';

import { initLoopSlider } from './features/loopSlider';
import { initVideoPlayers } from './features/videoPlayer';

window.Webflow ||= [];
window.Webflow.push(() => {
  const name = 'John Doe';
  greetUser(name);

  initLoopSlider();
  initVideoPlayers();
});
