# Attribution — real jaw geometry

`mandible.json` is a **decimated and normalized derivative** of a real human
mandible bone mesh (teeth removed) from the **Open-Full-Jaw** dataset,
`Patient_1/input/mandible/bone/mandible.stl`.

- Source: https://github.com/diku-dk/Open-Full-Jaw
- Citation: Gholamalizadeh, Moshfeghifar, Ferguson, Schneider, Panozzo, Darkner,
  Makaremi, Chan, Søndergaard, Erleben. *"Open-Full-Jaw: An open-access dataset
  and pipeline for finite element models of human jaw."* Computer Methods and
  Programs in Biomedicine, 224:107009, 2022.
- License: **Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (CC BY-NC-SA 4.0).**

## What was changed
The original ~478k-triangle binary STL was simplified via vertex clustering to
~5k vertices, recentered at the origin and uniformly scaled to ~24 units to fit
the viewer's coordinate frame. See `mock/preprocess-jaw.py` for the exact steps
and the source download (the original is git-LFS hosted in the dataset repo).

## ⚠️ NonCommercial
This asset (and therefore the generated fixtures derived from it) is licensed for
**non-commercial** use only, and any redistribution must be under the same
CC BY-NC-SA 4.0 terms. If this viewer is used commercially, replace this asset
with a mesh that permits commercial use.
