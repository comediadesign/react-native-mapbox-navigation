require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

$RNMBNAV = Object.new

def $RNMBNAV.pre_install(installer)
  installer.pod_targets.each do |pod|
    if pod.name.start_with?('react-native-') || pod.name.start_with?('ReactNative') || pod.name.start_with?('RN') || pod.name.eql?('RNPermissions') || pod.name.start_with?('Permission-')
      def pod.build_type;
        Pod::BuildType.static_library
      end
    end
  end
end


def $RNMBNAV.post_install(installer)
end


## RNMBNAVDownloadToken
# expo does not supports `.netrc`, so we need to patch curl commend used by cocoapods to pass the credentials

if $RNMBNAVDownloadToken
  module AddCredentialsToCurlWhenDownloadingMapboxNavigation
    def curl!(*args)
      mapbox_download = args.flatten.any? { |i| i.to_s.start_with?('https://api.mapbox.com') }
      if mapbox_download
        arguments = args.flatten
        arguments.prepend("-u","mapbox:#{$RNMBNAVDownloadToken}")
        super(*arguments)
      else
        super
      end
    end
  end

  class Pod::Downloader::Http
    prepend AddCredentialsToCurlWhenDownloadingMapboxNavigation
  end
end

Pod::Spec.new do |s|
  s.name         = "react-native-mapbox-navigation"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = <<-DESC
                  Smart Mapbox turn-by-turn routing based on real-time traffic for React Native.
                   DESC
  s.homepage     = "https://github.com/comediadesign/react-native-mapbox-navigation.git"
  s.license    = { :type => "MIT", :file => "LICENSE" }
  s.authors      = { "CoMedia Design" => "ben@comediadesign.com" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/comediadesign/react-native-mapbox-navigation.git", :tag => "#{s.version}" }
  s.ios.deployment_target  = '13.0'

  s.source_files = "ios/**/*.{h,m,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
  s.dependency "MapboxNavigation", "~> 2.9.0"
end


