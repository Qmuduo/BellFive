import { StyleSheet, Text, View } from 'react-native';

export default function GameScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BellFive</Text>
      <Text style={styles.subtitle}>Local game prototype</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F3EA',
  },
  title: {
    color: '#1F2933',
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    color: '#69747D',
    fontSize: 15,
  },
});
