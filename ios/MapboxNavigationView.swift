import MapboxCoreNavigation
import MapboxNavigation
import MapboxDirections
import MapboxMaps

// // adapted from https://pspdfkit.com/blog/2017/native-view-controllers-and-react-native/ and https://github.com/mslabenyak/react-native-mapbox-navigation/blob/master/ios/Mapbox/MapboxNavigationView.swift
extension UIView {
  var parentViewController: UIViewController? {
    var parentResponder: UIResponder? = self
    while parentResponder != nil {
      parentResponder = parentResponder!.next
      if let viewController = parentResponder as? UIViewController {
        return viewController
      }
    }
    return nil
  }
}

class MapboxNavigationView: UIView, NavigationViewControllerDelegate {
  weak var navViewController: NavigationViewController?
  var embedded: Bool
  var embedding: Bool
  var options: NavigationRouteOptions?
  
  @objc var origin: NSArray = [] {
    didSet { setNeedsLayout() }
  }
  
  @objc var destination: NSArray = [] {
    didSet { setNeedsLayout() }
  }
  
  @objc var route: NSString = ""
  @objc var shouldSimulateRoute: Bool = false
  @objc var showsEndOfRouteFeedback: Bool = false
  @objc var hideStatusView: Bool = false
  @objc var mute: Bool = true
  @objc var showsReportFeedback: Bool = false
  
  @objc var onLocationChange: RCTDirectEventBlock?
  @objc var onRouteProgressChange: RCTDirectEventBlock?
  @objc var onError: RCTDirectEventBlock?
  @objc var onCancelNavigation: RCTDirectEventBlock?
  @objc var onArrive: RCTDirectEventBlock?
  
  override init(frame: CGRect) {
    self.embedded = false
    self.embedding = false
    super.init(frame: frame)
  }
  
  required init?(coder aDecoder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    
    if (navViewController == nil && !embedding && !embedded) {
      embed()
    } else {
      navViewController?.view.frame = bounds
    }
  }
  
  override func removeFromSuperview() {
    super.removeFromSuperview()
    // cleanup and teardown any existing resources
    self.navViewController?.removeFromParent()
  }
  
  private func embed() {
    guard origin.count == 2 && destination.count == 2 else { return }
    
    embedding = true

    let originWaypoint = Waypoint(coordinate: CLLocationCoordinate2D(latitude: origin[1] as! CLLocationDegrees, longitude: origin[0] as! CLLocationDegrees))
    let destinationWaypoint = Waypoint(coordinate: CLLocationCoordinate2D(latitude: destination[1] as! CLLocationDegrees, longitude: destination[0] as! CLLocationDegrees))
    
    self.options = NavigationRouteOptions(waypoints: [originWaypoint, destinationWaypoint], profileIdentifier: .automobileAvoidingTraffic)
    
    let decoder = JSONDecoder()
    decoder.userInfo[.options] = self.options

    let decodedRoute: Route? = try? decoder.decode(Route.self, from: route.data(using: String.Encoding.utf8.rawValue)!)
    
    if let decodedRoute = decodedRoute {
      let routeResponse = RouteResponse(
        httpResponse: nil,
        identifier: "deserialize-route",
        routes: [decodedRoute],
        waypoints: [originWaypoint, destinationWaypoint],
        options: .route(self.options!),
        credentials: Directions.shared.credentials
      )
      self.afterRoute(routeResponse: routeResponse)
    } else {
      Directions.shared.calculate(self.options!) { [weak self] (_, result) in
        guard let strongSelf = self else {
          return
        }
        
        switch result {
        case .failure(let error):
          strongSelf.onError!(["message": error.localizedDescription])
        case .success(let routeResponse):
          strongSelf.afterRoute(routeResponse: routeResponse)
        }
        
        strongSelf.embedding = false
        strongSelf.embedded = true
      }
    }
  }
  
  private func afterRoute(routeResponse: RouteResponse) {
    guard let parentVC = self.parentViewController else {
      return
    }
    let indexedRouteResponse = IndexedRouteResponse(routeResponse: routeResponse, routeIndex: 0)
    let navigationService = MapboxNavigationService(
      indexedRouteResponse: indexedRouteResponse,
      customRoutingProvider: NavigationSettings.shared.directions,
      credentials: NavigationSettings.shared.directions.credentials,
      simulating: self.shouldSimulateRoute ? .always : .onPoorGPS
    )
    
    let navigationOptions = NavigationOptions(
      styles: [AventuraDayStyle(), AventuraNightStyle()],
      navigationService: navigationService
    )
    
    let vc = NavigationViewController(
      for: indexedRouteResponse,
      navigationOptions: navigationOptions
    )

    vc.showsEndOfRouteFeedback = self.showsEndOfRouteFeedback
    vc.showsReportFeedback = self.showsReportFeedback
    StatusView.appearance().isHidden = self.hideStatusView

    NavigationSettings.shared.voiceMuted = self.mute;
    
    vc.delegate = self
  
    parentVC.addChild(vc)
    self.addSubview(vc.view)
    vc.view.frame = self.bounds
    vc.didMove(toParent: parentVC)
    self.navViewController = vc
  }
  
  func navigationViewController(_ navigationViewController: NavigationViewController, didUpdate progress: RouteProgress, with location: CLLocation, rawLocation: CLLocation) {
    onLocationChange?(["longitude": location.coordinate.longitude, "latitude": location.coordinate.latitude])
    onRouteProgressChange?([
      "distanceTraveled": progress.distanceTraveled,
      "durationRemaining": progress.durationRemaining,
      "distanceRemaining": progress.distanceRemaining,
      "fractionTraveled": progress.fractionTraveled,
      "stepIndex": progress.legIndex + progress.currentLegProgress.stepIndex
    ])
  }
  
  func navigationViewControllerDidDismiss(_ navigationViewController: NavigationViewController, byCanceling canceled: Bool) {
    if (!canceled) {
      return;
    }
    onCancelNavigation?(["message": ""]);
  }
  
  func navigationViewController(_ navigationViewController: NavigationViewController, didArriveAt waypoint: Waypoint) -> Bool {
    onArrive?(["message": ""]);
    return true;
  }
}


class AventuraNightStyle : NightStyle {
    private let backgroundColor = #colorLiteral(red: 0, green: 0.1042077616, blue: 0.1785600185, alpha: 1)
    
    required init() {
        super.init()
        styleType = .night
    }
    
    override func apply() {
        super.apply()
        let traitCollection = UIScreen.main.traitCollection
        
        TopBannerView.appearance(for: traitCollection).backgroundColor = backgroundColor
        InstructionsBannerView.appearance(for: traitCollection).backgroundColor = backgroundColor
        BottomBannerView.appearance(for: traitCollection).backgroundColor = backgroundColor
        BottomPaddingView.appearance(for: traitCollection).backgroundColor = backgroundColor
        FloatingButton.appearance(for: traitCollection).backgroundColor = backgroundColor
    }
    
}


class AventuraDayStyle : AventuraNightStyle {
    private let backgroundColor = #colorLiteral(red: 0, green: 0.1042077616, blue: 0.1785600185, alpha: 1)
    
    required init() {
        super.init()
        mapStyleURL = URL(string: StyleURI.navigationDay.rawValue)!
        styleType = .day
    }
}
