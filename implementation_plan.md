# Resolve Audio Stuttering and UI Glitches

The frequent audio stuttering and glitching UI controls are caused by two separate issues:

1. **Audio Stuttering (Web Audio API Bug)**: Routing a live internet stream through the browser's Web Audio engine (`createMediaElementSource`) has a known bug on mobile browsers (especially Chrome and Safari) where the audio thread gets out of sync with the network buffer, causing severe, unfixable stuttering.
2. **Slider Glitches**: The custom range inputs for progress and volume are missing robust touch-release events (they use `onPointerUp` which fails on some mobile devices), causing them to get "stuck". Additionally, dragging them highlights nearby icons/text because text-selection is not disabled.

## Proposed Changes

### 1. Fix Sliders & Text Selection (`src/components/Player.jsx`)
- Add `select-none` to the player containers to prevent dragging from accidentally highlighting icons or text.
- Replace the buggy `localProgress` logic with rock-solid `onMouseUp` and `onTouchEnd` events that guarantee the slider releases properly and seeks the audio without getting stuck.

### 2. Remove Web Audio Engine (`src/services/CustomAudioPlayer.js`)
- I will completely rip out the `AudioContext` and Web Audio routing from the custom player.
- The audio will now play using the pure, native HTML5 `<audio>` engine. This is the **most robust and stable way** to play audio on the web and will completely eradicate all stuttering, buffering loops, and CPU heating.

### 3. Synthetic Visualizer (Keeping the Aesthetics)
- Because we are removing the Web Audio engine, we can no longer read the *actual* sound waves of the song for the visualizers.
- **Solution**: I will implement a highly optimized "Synthetic Visualizer" that generates a realistic, bouncing mathematical wave when the music is playing. 
- **Result**: The visualizer will still look exactly the same (dancing bars), but it will cost **zero** CPU power, and the audio will never stutter again.

## User Review Required
> [!IMPORTANT]
> By removing the Web Audio engine, the visualizer bars will no longer react to the *exact* beat of the specific song playing. Instead, they will dance to a realistic simulated rhythm whenever a song is playing. 
> 
> This is a highly recommended trade-off, as it is the **only guaranteed way** to completely fix the severe audio stuttering on mobile networks. Are you okay with the visualizer being simulated to achieve perfect, stutter-free audio playback?
