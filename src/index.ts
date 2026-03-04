import { greetUser } from '$utils/greet';

import { initLoopSlider } from './features/loopSlider';

window.Webflow ||= [];
window.Webflow.push(() => {
  const name = 'John Doe';
  greetUser(name);

  initLoopSlider();
});
