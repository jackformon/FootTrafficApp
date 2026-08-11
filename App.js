import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Linking, Alert, ScrollView } from 'react-native';

export default function FootTrafficDemo() {
  // Demo State simulating an active run
  const [orderStatus, setOrderStatus] = useState('AWAITING_PAYMENT'); 
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [foodConfirmed, setFoodConfirmed] = useState(false);

  const runnerVenmo = "Alex-Runner123";
  const feeAmount = "4.00";

  // Opens Venmo app with pre-filled details
  const handleOpenVenmo = () => {
    const url = `venmo://paycharge?txn=pay&recipients=${runnerVenmo}&amount=${feeAmount}&note=FootTraffic%20Pickup`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to web browser if Venmo app isn't installed
        Linking.openURL(`https://venmo.com/${runnerVenmo}`);
      }
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>🚶‍♂️ FootTraffic</Text>
      <Text style={styles.subtitle}>Active Order #104 — Chipotle</Text>

      {/* Lock Warning Banner */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Current Status: {orderStatus}</Text>
        <Text style={styles.statusSub}>
          {orderStatus !== 'COMPLETED' 
            ? "⚠️ Account locked for new runs/orders until this trip is verified by both parties."
            : "✅ Trip Completed! Your account is unlocked."}
        </Text>
      </View>

      {/* RECIPIENT VIEW */}
      <View style={styles.roleBox}>
        <Text style={styles.roleTitle}>📱 Recipient View (Jordan)</Text>
        
        {/* Step 1: Pay */}
        <TouchableOpacity 
          style={[styles.button, styles.venmoBtn]} 
          onPress={handleOpenVenmo}
        >
          <Text style={styles.btnText}>Pay ${feeAmount} to @{runnerVenmo} on Venmo</Text>
        </TouchableOpacity>

        {/* Step 2: Confirm Food Received */}
        <TouchableOpacity 
          style={[
            styles.button, 
            !paymentConfirmed ? styles.disabledBtn : styles.actionBtn
          ]} 
          disabled={!paymentConfirmed || foodConfirmed}
          onPress={() => {
            setFoodConfirmed(true);
            setOrderStatus('COMPLETED');
            Alert.alert("Success!", "Food delivery confirmed. Trip complete!");
          }}
        >
          <Text style={styles.btnText}>
            {foodConfirmed ? "✓ Food Received Confirmed" : "Confirm Food Received"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* RUNNER VIEW */}
      <View style={styles.roleBox}>
        <Text style={styles.roleTitle}>🏃 Runner View (Alex)</Text>
        
        {/* Step 1: Confirm Payment Received */}
        <TouchableOpacity 
          style={[
            styles.button, 
            paymentConfirmed ? styles.successBtn : styles.actionBtn
          ]} 
          disabled={paymentConfirmed}
          onPress={() => {
            setPaymentConfirmed(true);
            setOrderStatus('PICKING_UP_FOOD');
            Alert.alert("Payment Verified", "You confirmed receiving the $4. Go grab the food!");
          }}
        >
          <Text style={styles.btnText}>
            {paymentConfirmed ? "✓ Venmo Payment Verified" : "Confirm Venmo Received"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, backgroundColor: '#f5f5f7' },
  logo: { fontSize: 28, fontWeight: 'bold', color: '#1c1c1e', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#8e8e93', textAlign: 'center', marginBottom: 20 },
  statusCard: { backgroundColor: '#fff3cd', padding: 15, borderRadius: 10, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#ffc107' },
  statusTitle: { fontWeight: 'bold', fontSize: 16, color: '#856404' },
  statusSub: { fontSize: 13, color: '#856404', marginTop: 4 },
  roleBox: { backgroundColor: '#ffffff', padding: 16, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  roleTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#2c3e50' },
  button: { padding: 14, borderRadius: 8, alignItems: 'center', marginVertical: 6 },
  venmoBtn: { backgroundColor: '#008CFF' },
  actionBtn: { backgroundColor: '#28a745' },
  successBtn: { backgroundColor: '#6c757d' },
  disabledBtn: { backgroundColor: '#e0e0e0' },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 }
});
