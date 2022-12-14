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
        origin={[-105.140629, 39.760194]}
        destination={[-105.156544, 39.761801]}
      />
    </SafeAreaView>
  );
};

export default App;
