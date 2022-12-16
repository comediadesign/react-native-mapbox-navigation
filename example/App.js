import React from 'react';
import {SafeAreaView, useColorScheme, Text} from 'react-native';
import {Colors} from 'react-native/Libraries/NewAppScreen';
import NavigationComponent from './NavigationComponent';

const App = () => {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
    flex: 1,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <NavigationComponent
        origin={[-122.4020666, 37.7861745]}
        destination={[-122.4694143, 37.7546482]}
      />
    </SafeAreaView>
  );
};

export default App;
