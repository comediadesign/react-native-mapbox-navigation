import { promises } from 'fs';
import path from 'path';

import {
  ConfigPlugin,
  createRunOncePlugin,
  withDangerousMod,
  withXcodeProject,
  XcodeProject,
  withGradleProperties,
  WarningAggregator,
  withProjectBuildGradle,
  withAppBuildGradle,
} from '@expo/config-plugins';
import {
  mergeContents,
  removeGeneratedContents,
} from '@expo/config-plugins/build/utils/generateCode';

let pkg: { name: string; version?: string } = {
  name: '@hollertaxi/react-native-mapbox-navigation',
};
try {
  pkg = require('@hollertaxi/react-native-mapbox-navigation/package.json');
} catch {
  // empty catch block
}

type InstallerBlockName = 'pre' | 'post';

export type MapboxNavigationPlugProps = {
  RNMBNAVVersion?: string;
  RNMBNAVDownloadToken?: string;
  RNMapboxMapsVersion?: string;
};

/**
 * Dangerously adds the custom installer hooks to the Podfile.
 * In the future this should be removed in favor of some custom hooks provided by Expo autolinking.
 *
 * @param config
 * @returns
 */
const withCocoaPodsInstallerBlocks: ConfigPlugin<MapboxNavigationPlugProps> = (
  c,
  { RNMBNAVVersion, RNMBNAVDownloadToken, RNMapboxMapsVersion },
) => {
  return withDangerousMod(c, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      const contents = await promises.readFile(file, 'utf8');

      await promises.writeFile(
        file,
        applyCocoaPodsModifications(contents, {
          RNMBNAVVersion,
          RNMBNAVDownloadToken,
          RNMapboxMapsVersion
        }),
        'utf-8',
      );
      return config;
    },
  ]);
};

// Only the preinstaller block is required, the post installer block is
// used for spm (swift package manager) which Expo doesn't currently support.
export function applyCocoaPodsModifications(
  contents: string,
  { RNMBNAVVersion, RNMBNAVDownloadToken, RNMapboxMapsVersion }: MapboxNavigationPlugProps,
): string {
  // Ensure installer blocks exist
  let src = addConstantBlock(
    contents,
    RNMBNAVVersion,
    RNMBNAVDownloadToken,
    RNMapboxMapsVersion
  );
  src = addDisableOutputPathsBlock(src);
  src = addInstallerBlock(src, 'pre');
  src = addInstallerBlock(src, 'post');
  src = addMapboxInstallerBlock(src, 'pre');
  src = addMapboxInstallerBlock(src, 'post');
  return src;
}

export function addConstantBlock(
  src: string,
  RNMBNAVVersion?: string,
  RNMBNAVDownloadToken?: string,
  RNMapboxMapsVersion?: string
): string {
  const tag = `@hollertaxi/react-native-mapbox-navigation-rbmbnaversion`;

  return mergeContents({
    tag,
    src,
    newSrc: [
      RNMBNAVVersion && RNMBNAVVersion.length > 0 ? `$RNMBNAVVersion = '${RNMBNAVVersion}'` : '',
      RNMBNAVDownloadToken && RNMBNAVDownloadToken.length > 0 ? `$RNMBNAVDownloadToken = '${RNMBNAVDownloadToken}'` : '',
      RNMapboxMapsVersion && RNMapboxMapsVersion.length > 0 ? `$RNMapboxMapsVersion = '${RNMapboxMapsVersion}'` : ''
    ].join('\n'),
    anchor: /target .+ do/,
    // We can't go after the use_react_native block because it might have parameters, causing it to be multi-line (see react-native template).
    offset: 0,
    comment: '#',
  }).contents;
}

export function addDisableOutputPathsBlock(
  src: string
): string {
  const tag = `@hollertaxi/react-native-mapbox-navigation-rbmbnatop`;

  return mergeContents({
    tag,
    src,
    newSrc: ':disable_input_output_paths => true, \n',
    anchor: /:deterministic_uuids => false/,
    // We can't go after the use_react_native block because it might have parameters, causing it to be multi-line (see react-native template).
    offset: 0,
    comment: '#',
  }).contents;
}

export function addInstallerBlock(
  src: string,
  blockName: InstallerBlockName,
): string {
  const matchBlock = new RegExp(`${blockName}_install do \\|installer\\|`);
  const tag = `${blockName}_installer`;
  for (const line of src.split('\n')) {
    const contents = line.trim();
    // Ignore comments
    if (!contents.startsWith('#')) {
      // Prevent adding the block if it exists outside of comments.
      if (contents.match(matchBlock)) {
        // This helps to still allow revisions, since we enabled the block previously.
        // Only continue if the generated block exists...
        const modified = removeGeneratedContents(src, tag);
        if (!modified) {
          return src;
        }
      }
    }
  }

  return mergeContents({
    tag,
    src,
    newSrc: [`  ${blockName}_install do |installer|`, '  end'].join('\n'),
    anchor: /use_react_native/,
    // We can't go after the use_react_native block because it might have parameters, causing it to be multi-line (see react-native template).
    offset: 0,
    comment: '#',
  }).contents;
}

export function addMapboxInstallerBlock(
  src: string,
  blockName: InstallerBlockName,
): string {
  return mergeContents({
    tag: `@hollertaxi/react-native-mapbox-navigation-${blockName}_installer`,
    src,
    newSrc: `    $RNMBNAV.${blockName}_install(installer)`,
    anchor: new RegExp(`^\\s*${blockName}_install do \\|installer\\|`),
    offset: 1,
    comment: '#',
  }).contents;
}

/**
 * Exclude building for arm64 on simulator devices in the pbxproj project.
 * Without this, production builds targeting simulators will fail.
 */
export function setExcludedArchitectures(project: XcodeProject): XcodeProject {
  const configurations = project.pbxXCBuildConfigurationSection();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  for (const { buildSettings } of Object.values(configurations || {})) {
    // Guessing that this is the best way to emulate Xcode.
    // Using `project.addToBuildSettings` modifies too many targets.
    if (typeof buildSettings?.PRODUCT_NAME !== 'undefined') {
      buildSettings['"EXCLUDED_ARCHS[sdk=iphonesimulator*]"'] = '"arm64"';
    }
  }

  return project;
}

const withExcludedSimulatorArchitectures: ConfigPlugin = (c) => {
  return withXcodeProject(c, (config) => {
    config.modResults = setExcludedArchitectures(config.modResults);
    return config;
  });
};

const withAndroidPropertiesDownloadToken: ConfigPlugin<MapboxNavigationPlugProps> = (
  config,
  { RNMBNAVDownloadToken },
) => {
  const key = 'MAPBOX_DOWNLOADS_TOKEN';
  if (RNMBNAVDownloadToken) {
    return withGradleProperties(config, (config) => {
      config.modResults = config.modResults.filter((item) => {
        if (item.type === 'property' && item.key === key) {
          return false;
        }
        return true;
      });
      // eslint-disable-next-line fp/no-mutating-methods
      config.modResults.push({
        type: 'property',
        key,
        value: RNMBNAVDownloadToken,
      });

      return config;
    });
  } else {
    return config;
  }
};

const withAndroidPropertiesImpl2: ConfigPlugin<MapboxNavigationPlugProps> = (
  config,
  { RNMBNAVVersion },
) => {
  const key = 'expoRNMBNAVVersion';
  if (RNMBNAVVersion) {
    return withGradleProperties(config, (config) => {
      config.modResults = config.modResults.filter((item) => {
        if (item.type === 'property' && item.key === key) {
          return false;
        }
        return true;
      });
      // eslint-disable-next-line fp/no-mutating-methods
      config.modResults.push({
        type: 'property',
        key: key,
        value: RNMBNAVVersion,
      });

      return config;
    });
  } else {
    return config;
  }
};

const withAndroidProperties: ConfigPlugin<MapboxNavigationPlugProps> = (
  config,
  { RNMBNAVVersion, RNMBNAVDownloadToken, RNMapboxMapsVersion },
) => {
  config = withAndroidPropertiesDownloadToken(config, {
    RNMBNAVDownloadToken,
  });
  config = withAndroidPropertiesImpl2(config, { RNMBNAVVersion });
  return config;
};

const addLibCppFilter = (appBuildGradle: string): string => {
  if (appBuildGradle.includes("pickFirst 'lib/x86/libc++_shared.so'"))
    return appBuildGradle;
  return mergeContents({
    tag: `@hollertaxi/react-native-mapbox-navigation-libcpp`,
    src: appBuildGradle,
    newSrc: `packagingOptions {
        pickFirst 'lib/x86/libc++_shared.so'
        pickFirst 'lib/x86_64/libc++_shared.so'
        pickFirst 'lib/arm64-v8a/libc++_shared.so'
        pickFirst 'lib/armeabi-v7a/libc++_shared.so'
    }`,
    anchor: new RegExp(`^\\s*android\\s*{`),
    offset: 1,
    comment: '//',
  }).contents;
};

const addMapboxMavenRepo = (projectBuildGradle: string): string => {
  if (projectBuildGradle.includes('api.mapbox.com/downloads/v2/releases/maven'))
    return projectBuildGradle;

  /*
  return projectBuildGradle.replace(
    /repositories \s?{/,
    `repositories {
       maven {
        url 'https://api.mapbox.com/downloads/v2/releases/maven'
        authentication { basic(BasicAuthentication) }
        credentials { 
          username = 'mapbox'
          password = project.properties['MAPBOX_DOWNLOADS_TOKEN'] ?: ""
        }
       }
  `,
  );*/

  return mergeContents({
    tag: `@hollertaxi/react-native-mapbox-navigation-v2-maven`,
    src: projectBuildGradle,
    newSrc: `maven {
      url 'https://api.mapbox.com/downloads/v2/releases/maven'
      authentication { basic(BasicAuthentication) }
      credentials {
        username = 'mapbox'
        password = project.properties['MAPBOX_DOWNLOADS_TOKEN'] ?: ""
      }
    }`,
    anchor: new RegExp(`^\\s*allprojects\\s*{`), // TODO repositories { is needed as well
    offset: 2,
    comment: '//',
  }).contents;
};

const withAndroidAppGradle: ConfigPlugin<MapboxNavigationPlugProps> = (config) => {
  return withAppBuildGradle(config, ({ modResults, ...config }) => {
    if (modResults.language !== 'groovy') {
      WarningAggregator.addWarningAndroid(
        'withMapboxNavigation',
        `Cannot automatically configure app build.gradle if it's not groovy`,
      );
      return { modResults, ...config };
    }

    modResults.contents = addLibCppFilter(modResults.contents);
    return { modResults, ...config };
  });
};

const withAndroidProjectGradle: ConfigPlugin<MapboxNavigationPlugProps> = (config) => {
  return withProjectBuildGradle(config, ({ modResults, ...config }) => {
    if (modResults.language !== 'groovy') {
      WarningAggregator.addWarningAndroid(
        'withMapboxNavigation',
        `Cannot automatically configure app build.gradle if it's not groovy`,
      );
      return { modResults, ...config };
    }

    modResults.contents = addMapboxMavenRepo(modResults.contents);
    return { modResults, ...config };
  });
};

const withMapboxNavigationAndroid: ConfigPlugin<MapboxNavigationPlugProps> = (
  config,
  { RNMBNAVVersion, RNMBNAVDownloadToken, RNMapboxMapsVersion },
) => {
  config = withAndroidProperties(config, {
    RNMBNAVVersion,
    RNMBNAVDownloadToken,
  });
  config = withAndroidProjectGradle(config, { RNMBNAVVersion });
  config = withAndroidAppGradle(config, { RNMBNAVVersion });
  return config;
};

const withMapboxNavigation: ConfigPlugin<MapboxNavigationPlugProps> = (
  config,
  { RNMBNAVVersion, RNMBNAVDownloadToken },
) => {
  config = withExcludedSimulatorArchitectures(config);
  config = withMapboxNavigationAndroid(config, {
    RNMBNAVVersion,
    RNMBNAVDownloadToken,
  });
  return withCocoaPodsInstallerBlocks(config, {
    RNMBNAVVersion,
    RNMBNAVDownloadToken,
  });
};

export default createRunOncePlugin(withMapboxNavigation, pkg.name, pkg.version);