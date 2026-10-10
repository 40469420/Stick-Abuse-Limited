# Stick Labs (Unlimited) 2.2.2

- Replaced the Lab analytics view with a dedicated performance bench that runs only while the page is open and active.
- Added 5-, 10- and 30-second captures for report timing, center noise, stick range/circularity, release/snapback and trigger travel.
- Added high-resolution native XInput measurements with explicit controller-slot selection, packet-change rates, independent stick-change rates, query spacing and API call durations.
- Added timing histograms, percentiles, jitter measurements, center scatter and stick/trigger traces.
- Added read-only controller-command roundtrip tests, named local comparisons and JSON exports with controller, firmware and profile context.
- Measurements stop when leaving or hiding the page, minimizing or closing to tray, disconnecting the controller or quitting. Conflicting controller operations are blocked during a measurement.

Measurement limits: vendor report rate, XInput packet changes and software command roundtrips measure different paths. These tests do not establish true USB bus polling rate, physical sensor frequency, ADC resolution or physical button-to-game latency. The native XInput test can briefly use roughly one CPU core. Edited profile target settings may differ from the active controller profile.

Validation: type checks, production build, synthetic performance tests, native timing-helper checks and controller lifecycle regressions passed. The local portable was tested and approved by the user.

Includes the Windows setup installer and automatic updater files. No portable is published. Original controller firmware 2.1.0 and 2.2.9 remain bundled and available as separate assets; firmware flashing risks and recovery limitations are unchanged.
