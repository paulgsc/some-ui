# The RNNoise model the owner's takes are denoised with

`sh.rnnn` is the model ffmpeg's `arnndn` filter loads in the first step of
conditioning one of the owner's takes (HISS1, #3607; the owner's chain,
C1611). It is
`somnolent-hogwash-2018-09-01/sh.rnnn` from
[GregorR/rnnoise-models](https://github.com/GregorR/rnnoise-models) at commit
`3eee541a283fd3b8f81b85b1748e3b9ccbefa04d`: the model trained for speech
recorded with noise, the one the owner heard in the A/B.

That repository's README says of its models: "none of this work is creative
and thus none of it is subject to copyright."

Its bytes are pinned by `RNNOISE_MODEL.sha256` in `../owner-takes.ts`, and a
test checks the file against it. A new model is a new file and a new sum,
and a call that moves C1611.
