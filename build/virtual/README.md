# Optional simulated controller components

- Native client: `ViGEmClient.dll` (Windows x64), extracted without executing it from the `costura64.vigemclient.dll` resource in official NuGet package `Nefarius.ViGEm.Client` **1.21.256**.
- Package: https://api.nuget.org/v3-flatcontainer/nefarius.vigem.client/1.21.256/nefarius.vigem.client.1.21.256.nupkg
- Package SHA-256: `ff460031b33e0882cd1166fe2d072d0fe97578480c61ed85dccfa6c930fdb55e`
- Native client SHA-256: `00303f99e1968d523fbd08a7c691d60d145b7335059ec593947841d124c10875`
- Client license: MIT, included as LICENSE-ViGEmClient.txt.
- Driver installer is **not bundled or automatically installed**. The optional in-app button fetches official ViGEmBus 1.22.0, checks SHA-256 `89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a` and a valid Nefarius Authenticode signature, then requests Windows elevation. ViGEmBus is retired upstream.
- `virtual-host.exe` is compiled from our source by `node scripts/build-virtual-host.mjs` (also part of desktop build). It uses XInput for full-precision passthrough, ViGEm for virtual Xbox output, and Windows SendInput for optional keyboard/mouse macro steps. Parent EOF and heartbeat loss trigger releases and removal. The parent also requests emergency key-up after abnormal host exit.
- `virtual-host.exe --selftest` exercises merge/layout code without opening drivers or injecting input. `--probe` checks the bus without creating a virtual controller. `--run` is used only after explicit app setup/enable.
