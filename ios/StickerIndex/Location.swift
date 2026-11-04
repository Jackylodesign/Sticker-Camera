// Where a photo was taken. Stays with you: the public site only ever shows the area.
import CoreLocation

@MainActor
final class Location: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var latest: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// Asks permission the first time, then looks up where we are now.
    func refresh() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if isAllowed {
            manager.requestLocation()
        }
    }

    /// nil if permission was refused, or the fix is too old to trust.
    var current: CLLocation? {
        guard let latest, latest.timestamp.timeIntervalSinceNow > -300 else { return nil }
        return latest
    }

    private var isAllowed: Bool {
        manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            if isAllowed { self.manager.requestLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in latest = locations.last }
    }

    // No fix is fine: the sticker just has no place. Nothing to show the user.
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
