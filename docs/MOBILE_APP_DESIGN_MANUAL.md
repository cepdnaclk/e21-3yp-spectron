# SPECTRON AgriAssist Mobile Design Manual

## Purpose

SPECTRON AgriAssist helps farmers check farms, fields, crop health, hardware, and alerts from a phone. Keep every screen calm, clear, and usable without technical training.

## Design principles

- One main task per screen.
- Use plain farm language: Farm, Field, Crop, Hardware, Alerts, and Signal.
- Show a clear primary action such as **Add Farm** or **Set up hardware**.
- Put explanations behind an `i` icon; do not fill screens with long instructions.
- Use colour together with words: Good, Needs attention, Offline, and Waiting setup.
- Keep owner and viewer screens consistent. Only owners see write actions and **Access**.

## Mobile layout

- Design first for narrow screens (360–430 px wide).
- Keep content inside 16 px side margins.
- Use cards for grouped information and one-column layouts on phones.
- Make buttons and icon controls at least 44 × 44 px.
- Use full-width primary buttons where an action needs attention.
- Allow scrolling; never hide important content behind the bottom bar.
- Respect Android safe areas at the top and bottom of the screen.

## Navigation

The customer app uses a bottom navigation bar:

| Item | Purpose |
| --- | --- |
| Farms | Open and manage farms |
| Live | View current readings and trends |
| Hardware | Set up and check controllers and sensors |
| Alerts | Review farm warnings |
| Access | Owners only: invite or remove viewers |

The profile picture in the header opens **Profile**. Do not use a vague “More” destination.

## Branding

- Use the SPECTRON logo in the app header, sign-in screens, launcher icon, and launch screen.
- Use the warm cream background, leaf green for normal actions, and orange for important actions.
- Keep headings short and high contrast.
- The Android application label is **SPECTRON AgriAssist**.

## Forms and feedback

- Use labels above fields, short examples, and immediate friendly validation.
- Keep required information clear.
- Show success and error messages close to the action that caused them.
- Confirm destructive actions such as deleting a farm or removing access.

## Accessibility and translation

- Do not rely on colour alone.
- Give icons accessible labels and tooltips when needed.
- Avoid text embedded in images.
- Keep strings short so Sinhala, Tamil, and English translations fit naturally.

