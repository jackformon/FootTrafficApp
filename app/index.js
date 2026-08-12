import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView, 
  ScrollView, TextInput, Modal, Alert, Platform, ActivityIndicator 
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../supabase';

let MapView, Marker, Circle;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Circle = Maps.Circle;
}

export default function FootTrafficApp() {
  // Auth State
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [userVenmo, setUserVenmo] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [guidelinesAgreed, setGuidelinesAgreed] = useState(false);

  // Role Selection Checkboxes
  const [isOrdererRole, setIsOrdererRole] = useState(true);
  const [isRunnerRole, setIsRunnerRole] = useState(false);
  const [isRunnerOnboarded, setIsRunnerOnboarded] = useState(false);

  // User Settings State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newVenmo, setNewVenmo] = useState('');

  // App Navigation
  const [currentTab, setCurrentTab] = useState('feed');
  const [activitySubTab, setActivitySubTab] = useState('runs');
  
  // Location State
  const [isVerifyingLocation, setIsVerifyingLocation] = useState(true);
  const [userCoords, setUserCoords] = useState(null);
  const [locationVerified, setLocationVerified] = useState(false);

  // Modals
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [guidelinesModalVisible, setGuidelinesModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [runnerOnboardingModalVisible, setRunnerOnboardingModalVisible] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [droppedPin, setDroppedPin] = useState(null);

  // Form State
  const [restaurant, setRestaurant] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [radius, setRadius] = useState('0.5 mi');
  const [cutoffPreset, setCutoffPreset] = useState('In 30m');
  const [maxOrders, setMaxOrders] = useState('2');

  // Order Details State & 3-Min Hold Timer
  const [selectedRun, setSelectedRun] = useState(null);
  const [pickupName, setPickupName] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [holdTimeLeft, setHoldTimeLeft] = useState(180);

  // PIN Entry State
  const [enteredPin, setEnteredPin] = useState('');

  // Live Database State
  const [allDropoffs, setAllDropoffs] = useState([]);
  const [activeConversations, setActiveConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [reportReason, setReportReason] = useState('');

  // Helper: Cross-Platform Web & Native Popup Alert
  const showCustomAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const getPresetTimeString = (preset) => {
    const d = new Date();
    if (preset === 'In 15m') d.setMinutes(d.getMinutes() + 15);
    else if (preset === 'In 30m') d.setMinutes(d.getMinutes() + 30);
    else if (preset === 'In 1h') d.setHours(d.getHours() + 1);
    else return '11:59 PM';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDistanceFromLatLonInMiles = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 3958.8;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Auth Session Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const venmo = session?.user?.user_metadata?.venmo || session?.user?.email?.split('@')[0] || 'User';
      const runnerStatus = session?.user?.user_metadata?.is_runner_onboarded || false;
      setUserVenmo(venmo);
      setNewVenmo(venmo);
      setIsRunnerOnboarded(runnerStatus);
      if (session?.user?.email) setNewEmail(session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      const venmo = session?.user?.user_metadata?.venmo || session?.user?.email?.split('@')[0] || 'User';
      const runnerStatus = session?.user?.user_metadata?.is_runner_onboarded || false;
      setUserVenmo(venmo);
      setNewVenmo(venmo);
      setIsRunnerOnboarded(runnerStatus);
      if (session?.user?.email) setNewEmail(session.user.email);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize App Data when Authenticated
  useEffect(() => {
    if (!session) return;

    verifyUserLocation();
    fetchLiveRuns();
    fetchLiveChats();

    const runsSubscription = supabase
      .channel('public:runs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, () => {
        fetchLiveRuns();
      })
      .subscribe();

    const chatsSubscription = supabase
      .channel('public:chats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        fetchLiveChats();
        fetchLiveRuns();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(runsSubscription);
      supabase.removeChannel(chatsSubscription);
    };
  }, [session]);

  // 3-Minute Hold Timer
  useEffect(() => {
    let timer;
    if (orderModalVisible && holdTimeLeft > 0) {
      timer = setInterval(() => {
        setHoldTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (holdTimeLeft === 0 && orderModalVisible) {
      showCustomAlert("Hold Expired", "Your 3-minute hold on this order spot has expired.");
      setOrderModalVisible(false);
    }
    return () => clearInterval(timer);
  }, [orderModalVisible, holdTimeLeft]);

  // Web Map Click Listener
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMapMessage = (event) => {
        if (event.data && event.data.type === 'PIN_DROPPED') {
          setDroppedPin({
            latitude: event.data.lat,
            longitude: event.data.lng
          });
          setDropoff(`Pinned: ${event.data.lat.toFixed(4)}, ${event.data.lng.toFixed(4)}`);
        }
      };
      window.addEventListener('message', handleWebMapMessage);
      return () => window.removeEventListener('message', handleWebMapMessage);
    }
  }, []);

  // Chat Real-time Listener
  useEffect(() => {
    if (!activeChatId) return;
    fetchChatMessages(activeChatId);

    const messageSubscription = supabase
      .channel(`public:messages:chat_id=eq.${activeChatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChatId}` }, payload => {
        setChatMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSubscription);
    };
  }, [activeChatId]);

  // ACTION: SUBMIT ORDER PROMPT & GENERATE 4-DIGIT PIN
  const handleSubmitOrderPrompt = async () => {
    if (!pickupName || !orderRef || !deliveryAddress || !orderDescription) {
      showCustomAlert("Missing Details", "Please fill in all fields: Name, Ref #, Delivery Address, and Food Items Description.");
      return;
    }

    try {
      const { data: existingChats } = await supabase
        .from('chats')
        .select('id')
        .eq('run_id', selectedRun.id);

      const capacity = selectedRun.maxCapacity || 2;

      if (existingChats && existingChats.length >= capacity) {
        showCustomAlert("Run Full", `Sorry! This run has reached its maximum capacity of ${capacity} orders.`);
        setOrderModalVisible(false);
        return;
      }

      // Generate a random 4-Digit Pickup PIN
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

      const fullDeliveryNotes = deliveryInstructions 
        ? `${deliveryAddress} (Note: ${deliveryInstructions})`
        : deliveryAddress;

      const newChat = {
        run_id: selectedRun.id,
        restaurant: selectedRun.restaurant,
        runner_venmo: selectedRun.venmo,
        pickup_name: pickupName,
        order_ref: orderRef,
        delivery_address: fullDeliveryNotes,
        order_items: orderDescription,
        status: 'Order Placed',
        delivery_pin: generatedPin
      };

      const { data, error } = await supabase.from('chats').insert([newChat]).select();

      if (error) {
        showCustomAlert("Database Error", error.message || "Failed to create order chat.");
        return;
      }

      if (data && data.length > 0) {
        const createdChat = data[0];

        await supabase.from('messages').insert([
          { chat_id: createdChat.id, sender: 'System', text: `📦 Order created for ${selectedRun.restaurant}.\n• Name: "${pickupName}" | Ref: #${orderRef}\n• Dropoff At: ${fullDeliveryNotes}\n• Items: ${orderDescription}` },
          { chat_id: createdChat.id, sender: 'System', text: `🔑 Secret Delivery PIN: ${generatedPin}\nProvide this PIN to your runner upon in-person delivery to confirm release.` }
        ]);

        setActiveChatId(createdChat.id);
        setOrderModalVisible(false);
        setPickupName('');
        setOrderRef('');
        setDeliveryAddress('');
        setDeliveryInstructions('');
        setOrderDescription('');
        setCurrentTab('chats');
        fetchLiveChats();
      }
    } catch (err) {
      showCustomAlert("Error", err.message);
    }
  };

  // ACTION: VERIFY PIN & COMPLETE DELIVERY (RUNNER)
  const handleVerifyPinSubmit = async () => {
    if (!enteredPin || !currentChat) return;

    if (enteredPin.trim() === currentChat.delivery_pin) {
      await supabase.from('chats').update({ status: 'Completed' }).eq('id', currentChat.id);
      await supabase.from('messages').insert([
        { chat_id: currentChat.id, sender: 'System', text: `🎉 Delivery PIN Verified! Order completed successfully. Payout released!` }
      ]);

      setEnteredPin('');
      setPinModalVisible(false);
      fetchLiveChats();
      showCustomAlert("Delivery Verified! 🎉", "PIN verified successfully. Order is complete!");
    } else {
      showCustomAlert("Incorrect PIN", "The PIN entered does not match the recipient's delivery code. Please verify with the recipient.");
    }
  };

  const handleOpenPostRunModal = () => {
    if (!isRunnerOnboarded) {
      setRunnerOnboardingModalVisible(true);
    } else {
      setPostModalVisible(true);
    }
  };

  const handleCompleteRunnerOnboarding = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { is_runner_onboarded: true }
      });
      if (error) throw error;
      setIsRunnerOnboarded(true);
      setRunnerOnboardingModalVisible(false);
      showCustomAlert("Runner Verified! 🎉", "You are now verified to post runs and earn money.");
      setPostModalVisible(true);
    } catch (err) {
      showCustomAlert("Error", err.message);
    }
  };

  const handleAuth = async () => {
    if (!authEmail || !authPassword) {
      showCustomAlert("Missing Fields", "Please enter your email and password.");
      return;
    }

    setAuthLoading(true);

    if (isSigningUp) {
      if (!authEmail.toLowerCase().trim().endsWith('@georgetown.edu')) {
        showCustomAlert("Georgetown Only", "Please sign up using your @georgetown.edu email address.");
        setAuthLoading(false);
        return;
      }

      if (!guidelinesAgreed) {
        setGuidelinesModalVisible(true);
        setAuthLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          data: { 
            venmo: userVenmo.replace('@', ''),
            is_runner_onboarded: isRunnerRole
          }
        }
      });

      if (error) {
        showCustomAlert("Sign Up Error", error.message);
      } else {
        showCustomAlert("Hoya Account Created", "Welcome to FootTraffic Georgetown!");
        if (isRunnerRole) {
          setRunnerOnboardingModalVisible(true);
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (error) showCustomAlert("Login Error", error.message);
    }

    setAuthLoading(false);
  };

  const verifyUserLocation = async () => {
    setIsVerifyingLocation(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      setIsVerifyingLocation(false);
      setUserCoords({ latitude: 38.9076, longitude: -77.0723, latitudeDelta: 0.012, longitudeDelta: 0.012 });
      return;
    }

    let loc = await Location.getCurrentPositionAsync({});
    setUserCoords({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    });
    setLocationVerified(true);
    setIsVerifyingLocation(false);
  };

  const fetchLiveRuns = async () => {
    const { data: runs, error } = await supabase.from('runs').select('*').order('created_at', { ascending: false });
    if (error || !runs) return;

    const { data: chats } = await supabase.from('chats').select('run_id');

    const runsWithOrderCount = runs.map(run => {
      const runChats = chats ? chats.filter(c => c.run_id === run.id) : [];
      return {
        ...run,
        ordersCount: runChats.length,
        maxCapacity: run.max_orders ? parseInt(run.max_orders, 10) : 2
      };
    });

    setAllDropoffs(runsWithOrderCount);
  };

  const fetchLiveChats = async () => {
    const cleanUserVenmo = userVenmo.toLowerCase().replace('@', '');
    const userEmailPrefix = session?.user?.email?.split('@')[0]?.toLowerCase();

    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const myPrivateChats = data.filter(chat => {
        const runnerVenmo = chat.runner_venmo?.toLowerCase().replace('@', '');
        const pickupName = chat.pickup_name?.toLowerCase();

        const isRunner = runnerVenmo === cleanUserVenmo;
        const isRecipient = pickupName === userEmailPrefix || chat.delivery_address?.toLowerCase().includes(userEmailPrefix);

        return isRunner || isRecipient;
      });

      setActiveConversations(myPrivateChats);
    }
  };

  const fetchChatMessages = async (chatId) => {
    const { data, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (!error && data) setChatMessages(data);
  };

  const isCutoffPassed = (cutoffStr) => {
    if (!cutoffStr) return false;

    const now = new Date();
    const match = cutoffStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return false;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3] ? match[3].toUpperCase() : null;

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    if (!period && hours < 12 && now.getHours() >= 12) {
      hours += 12;
    }

    const cutoffDate = new Date();
    cutoffDate.setHours(hours, minutes, 0, 0);

    if (now.getHours() >= 20 && hours < 6) {
      cutoffDate.setDate(cutoffDate.getDate() + 1);
    }

    const bufferedCutoff = new Date(cutoffDate.getTime() + 15 * 60 * 1000);

    return now > bufferedCutoff;
  };

  const visibleDropoffs = allDropoffs.filter(run => {
    if (isCutoffPassed(run.cutoff)) return false;

    if (userCoords && run.latitude && run.longitude) {
      const distInMiles = getDistanceFromLatLonInMiles(
        userCoords.latitude,
        userCoords.longitude,
        run.latitude,
        run.longitude
      );

      const runRadiusLimit = parseFloat(run.radius) || 0.5;
      return distInMiles <= runRadiusLimit;
    }

    return true;
  });

  const myPostedRuns = allDropoffs.filter(run => run.venmo?.toLowerCase() === userVenmo.toLowerCase().replace('@', ''));

  const handleConfirmPinDrop = () => {
    if (droppedPin) {
      setDropoff(`Pinned: ${droppedPin.latitude.toFixed(4)}, ${droppedPin.longitude.toFixed(4)}`);
    } else {
      setDropoff(`Pinned: Georgetown Campus (${userCoords?.latitude.toFixed(4) || '38.9076'}, ${userCoords?.longitude.toFixed(4) || '-77.0723'})`);
    }
    setMapPickerVisible(false);
  };

  const handlePostRun = async () => {
    if (!restaurant.trim()) {
      showCustomAlert("Missing Information", "Please enter the restaurant name.");
      return;
    }

    const currentVenmo = userVenmo || session?.user?.email?.split('@')[0] || 'HoyaRunner';
    const computedCutoff = getPresetTimeString(cutoffPreset);
    const finalLat = droppedPin?.latitude || userCoords?.latitude || 38.9076;
    const finalLng = droppedPin?.longitude || userCoords?.longitude || -77.0723;
    const finalLocation = dropoff || `Pinned: Georgetown Campus (${finalLat.toFixed(4)}, ${finalLng.toFixed(4)})`;

    const newRun = {
      restaurant: restaurant.trim(),
      location: finalLocation,
      radius: `${radius} radius`,
      cutoff: computedCutoff,
      fee: '$4.00',
      venmo: currentVenmo,
      max_orders: parseInt(maxOrders, 10) || 2,
      latitude: finalLat,
      longitude: finalLng
    };

    try {
      let { data, error } = await supabase.from('runs').insert([newRun]).select();
      
      if (error && error.message?.includes('column')) {
        const fallbackRun = {
          restaurant: restaurant.trim(),
          location: finalLocation,
          radius: `${radius} radius`,
          cutoff: computedCutoff,
          fee: '$4.00',
          venmo: currentVenmo
        };
        const retry = await supabase.from('runs').insert([fallbackRun]).select();
        error = retry.error;
        data = retry.data;
      }

      if (error) {
        showCustomAlert("Database Error", error.message || "Could not insert run into Supabase.");
        return;
      }

      setRestaurant('');
      setDropoff('');
      setDroppedPin(null);
      setCutoffPreset('In 30m');
      setMaxOrders('2');
      setPostModalVisible(false);
      setCurrentTab('feed');
      fetchLiveRuns();

    } catch (err) {
      showCustomAlert("Error", err.message);
    }
  };

  const handleUpdateSettings = async () => {
    try {
      const updates = {};
      if (newEmail && newEmail !== session?.user?.email) {
        if (!newEmail.toLowerCase().trim().endsWith('@georgetown.edu')) {
          showCustomAlert("Georgetown Email Required", "Updated email must be a valid @georgetown.edu address.");
          return;
        }
        updates.email = newEmail;
      }
      if (newPassword) updates.password = newPassword;
      if (newVenmo) updates.data = { venmo: newVenmo.replace('@', '') };

      const { error } = await supabase.auth.updateUser(updates);

      if (error) {
        showCustomAlert("Update Error", error.message);
      } else {
        setUserVenmo(newVenmo.replace('@', ''));
        showCustomAlert("Settings Updated", "Your account settings have been saved!");
        setSettingsModalVisible(false);
        setNewPassword('');
      }
    } catch (e) {
      showCustomAlert("Error", e.message);
    }
  };

  const handleReportSubmit = async () => {
    if (!reportReason.trim() || !activeChatId) return;

    await supabase.from('messages').insert([
      { chat_id: activeChatId, sender: 'System', text: `🚩 ISSUE REPORTED: "${reportReason.trim()}". Georgetown Admin notified.` }
    ]);

    showCustomAlert("Report Filed", "Thank you. Our Georgetown campus moderation team has logged this issue for review.");
    setReportReason('');
    setReportModalVisible(false);
  };

  const currentChat = activeConversations.find(c => c.id === activeChatId);
  const cleanUserVenmo = userVenmo.toLowerCase().replace('@', '');
  const cleanRunnerVenmo = currentChat?.runner_venmo?.toLowerCase().replace('@', '');
  const isRunner = cleanUserVenmo === cleanRunnerVenmo;

  // --- AUTH SCREEN ---
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authContainer}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>
              Foot<Text style={styles.logoAccent}>Traffic</Text>
            </Text>
            <Text style={styles.guTagline}>GEORGETOWN HOYAS</Text>
            <View style={styles.logoBar} />
          </View>

          <Text style={styles.authSubtitle}>
            {isSigningUp ? 'Create your @georgetown.edu account.' : 'Sign in with your Georgetown email.'}
          </Text>

          <Text style={styles.label}>Georgetown Email (@georgetown.edu required)</Text>
          <TextInput 
            style={styles.input} 
            placeholder="netid@georgetown.edu" 
            placeholderTextColor="#8A99AD"
            autoCapitalize="none"
            value={authEmail}
            onChangeText={setAuthEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput 
            style={styles.input} 
            placeholder="••••••••" 
            placeholderTextColor="#8A99AD"
            secureTextEntry={true}
            value={authPassword}
            onChangeText={setAuthPassword}
          />

          {isSigningUp && (
            <>
              <Text style={styles.label}>Venmo Handle (for payouts)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="@your-venmo" 
                placeholderTextColor="#8A99AD"
                value={userVenmo}
                onChangeText={setUserVenmo}
              />

              <Text style={styles.label}>I want to use FootTraffic to:</Text>
              <View style={styles.checkboxRow}>
                <TouchableOpacity 
                  style={[styles.checkbox, isOrdererRole && styles.checkboxActive]} 
                  onPress={() => setIsOrdererRole(!isOrdererRole)}
                >
                  <Text style={[styles.checkboxText, isOrdererRole && styles.checkboxTextActive]}>
                    {isOrdererRole ? '✅ Order Food' : '⬜ Order Food'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.checkbox, isRunnerRole && styles.checkboxActive]} 
                  onPress={() => setIsRunnerRole(!isRunnerRole)}
                >
                  <Text style={[styles.checkboxText, isRunnerRole && styles.checkboxTextActive]}>
                    {isRunnerRole ? '✅ Post Runs (Earn)' : '⬜ Post Runs (Earn)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isRunnerRole && (
                <View style={styles.taxNoteBox}>
                  <Text style={styles.taxNoteText}>
                    ℹ️ <Text style={{fontWeight: '700'}}>Runner Note:</Text> Federal laws require brief payout verification for earn accounts. If you earn under $400/year in self-employment income, you typically owe $0 in taxes.
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.guidelinesCheckRow} onPress={() => setGuidelinesModalVisible(true)}>
                <Text style={styles.guidelinesCheckText}>
                  {guidelinesAgreed ? '✅ Agreed to Georgetown Community Rules' : '📜 Tap to Review & Accept Hoya Guidelines'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.postButton} onPress={handleAuth} disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.postButtonText}>{isSigningUp ? 'Sign Up as Hoya' : 'Log In'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsSigningUp(!isSigningUp)}>
            <Text style={styles.toggleAuthText}>
              {isSigningUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up (@georgetown.edu)"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* GUIDELINES MODAL */}
        <Modal visible={guidelinesModalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Georgetown Hoya Safety Rules</Text>
              <Text style={styles.modalSub}>FootTraffic is a verified peer-to-peer Georgetown network. By joining, you agree to:</Text>

              <View style={styles.ruleBox}>
                <Text style={styles.ruleText}>1. <Text style={{fontWeight: '700'}}>Pay Promptly:</Text> Send $4.00 + food costs via Venmo immediately upon order placement.</Text>
                <Text style={styles.ruleText}>2. <Text style={{fontWeight: '700'}}>No Theft / Zero Tolerance:</Text> Failure to deliver food or pay results in an instant permanent ban and university referral.</Text>
                <Text style={styles.ruleText}>3. <Text style={{fontWeight: '700'}}>Verified Dropoffs:</Text> Provide secret PIN to runner upon in-person delivery.</Text>
              </View>

              <TouchableOpacity 
                style={[styles.modalBtn, styles.submitBtn, { marginTop: 12 }]} 
                onPress={() => {
                  setGuidelinesAgreed(true);
                  setGuidelinesModalVisible(false);
                }}
              >
                <Text style={styles.submitBtnText}>I Agree & Understand Rules</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    );
  }

  const mapLat = droppedPin?.latitude || userCoords?.latitude || 38.9076;
  const mapLng = droppedPin?.longitude || userCoords?.longitude || -77.0723;
  const webInteractiveMapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style> body, html, #map { height: 100%; margin: 0; padding: 0; } </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map').setView([${mapLat}, ${mapLng}], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        var marker = L.marker([${mapLat}, ${mapLng}], {draggable: true}).addTo(map);
        function updatePin(lat, lng) {
          marker.setLatLng([lat, lng]);
          window.parent.postMessage({ type: 'PIN_DROPPED', lat: lat, lng: lng }, '*');
        }
        map.on('click', function(e) { updatePin(e.latlng.lat, e.latlng.lng); });
        marker.on('dragend', function(e) { var p = marker.getLatLng(); updatePin(p.lat, p.lng); });
      </script>
    </body>
    </html>
  `;

  // --- MAIN APP ---
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.innerContainer}>
        
        {/* LOGO & ACCOUNT HEADER */}
        <View style={styles.headerRow}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>
              Foot<Text style={styles.logoAccent}>Traffic</Text>
            </Text>
            <Text style={styles.guTagline}>GEORGETOWN</Text>
            <View style={styles.logoBar} />
          </View>

          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)}>
              <Text style={styles.settingsBtnText}>⚙️ Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signOutBtn} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* LOCATION BANNER */}
        <View style={styles.locationBanner}>
          {isVerifyingLocation ? (
            <View style={styles.bannerRow}>
              <ActivityIndicator size="small" color="#041E42" />
              <Text style={styles.bannerText}>Verifying Hilltop location...</Text>
            </View>
          ) : locationVerified ? (
            <Text style={styles.bannerTextSuccess}>Verified Georgetown Campus • Signed in as @{userVenmo || session?.user?.email?.split('@')[0]}</Text>
          ) : (
            <TouchableOpacity onPress={verifyUserLocation}>
              <Text style={styles.bannerTextError}>Location Unverified • Tap to retry</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* --- PAGE 1: FEED TAB --- */}
        {currentTab === 'feed' && (
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionHeader}>Campus Dropoffs</Text>

            <View style={styles.feedBox}>
              <ScrollView contentContainerStyle={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {visibleDropoffs.length === 0 ? (
                  <Text style={styles.emptyStateSub}>No active Hoya dropoffs nearby. Tap below to post one!</Text>
                ) : (
                  visibleDropoffs.map((item, index) => {
                    const isMyRun = item.venmo?.toLowerCase() === userVenmo?.toLowerCase().replace('@', '');
                    const capacity = item.maxCapacity || 2;
                    const isFull = item.ordersCount >= capacity;

                    return (
                      <TouchableOpacity 
                        key={item.id} 
                        style={[
                          styles.cardItem, 
                          index === visibleDropoffs.length - 1 && { borderBottomWidth: 0 },
                          isMyRun && styles.myRunCard,
                          isFull && !isMyRun && { opacity: 0.6 }
                        ]}
                        disabled={isFull || isMyRun}
                        onPress={() => {
                          setSelectedRun(item);
                          setHoldTimeLeft(180);
                          setOrderModalVisible(true);
                        }}
                      >
                        <View style={styles.cardRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.restaurantText}>{item.restaurant}</Text>
                            {isMyRun && (
                              <View style={styles.myRunBadge}>
                                <Text style={styles.myRunBadgeText}>YOUR RUN</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.feeText}>{isFull ? `FULL (${capacity}/${capacity})` : item.fee}</Text>
                        </View>
                        <Text style={styles.locationText}>{item.location} • <Text style={{fontWeight: '600'}}>{item.radius}</Text></Text>
                        <Text style={styles.timeText}>
                          {isMyRun ? `Runner: @${item.venmo} (You) • ${item.ordersCount || 0}/${capacity} Spots Filled` : (isFull ? '⚠️ Capacity Reached' : `Taking orders until ${item.cutoff} (${item.ordersCount || 0}/${capacity} spots)`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.postButton} onPress={handleOpenPostRunModal}>
              <Text style={styles.postButtonText}>Post a Run</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* --- PAGE 2: CHATS PAGE --- */}
        {currentTab === 'chats' && (
          <View style={{ flex: 1 }}>
            {activeChatId && currentChat ? (
              <View style={styles.chatContainer}>
                <View style={styles.chatHeader}>
                  <View>
                    <Text style={styles.chatTitle}>{currentChat.restaurant} Order</Text>
                    <Text style={styles.chatSub}>
                      Runner: @{currentChat.runner_venmo} • Status: <Text style={{ fontWeight: '800', color: currentChat.status === 'Completed' ? '#041E42' : '#F59E0B' }}>{currentChat.status}</Text>
                    </Text>
                  </View>

                  {/* RECIPIENT PIN DISPLAY IN CHAT HEADER */}
                  {!isRunner && currentChat.delivery_pin && (
                    <View style={styles.pinHeaderBadge}>
                      <Text style={styles.pinHeaderLabel}>YOUR PICKUP PIN</Text>
                      <Text style={styles.pinHeaderText}>{currentChat.delivery_pin}</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => setReportModalVisible(true)}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>🚩 Report</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveChatId(null)}>
                      <Text style={styles.backToListText}>All Chats</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* DETAILS BANNER */}
                <View style={styles.orderDetailsBanner}>
                  <Text style={styles.orderDetailsTitle}>Deliver To: <Text style={{ fontWeight: '400' }}>{currentChat.delivery_address || 'Georgetown Campus Location'}</Text></Text>
                  <Text style={styles.orderDetailsTitle}>Items: <Text style={{ fontWeight: '400' }}>{currentChat.order_items || 'Standard Order'}</Text></Text>
                </View>

                {/* RUNNER VERIFY PIN BUTTON */}
                {isRunner && currentChat.status !== 'Completed' && (
                  <TouchableOpacity style={styles.verifyPinBtn} onPress={() => setPinModalVisible(true)}>
                    <Text style={styles.verifyPinBtnText}>🔢 Enter Delivery PIN from Recipient</Text>
                  </TouchableOpacity>
                )}

                <ScrollView style={styles.messageBox} showsVerticalScrollIndicator={false}>
                  {chatMessages.map((msg, index) => {
                    const isUserMsg = msg.sender === session?.user?.email?.split('@')[0];
                    const isSystem = msg.sender === 'System';

                    return (
                      <View 
                        key={`${msg.id}-${index}`} 
                        style={[
                          styles.messageBubble, 
                          isSystem ? styles.systemBubble : (isUserMsg ? styles.userBubble : styles.runnerBubble)
                        ]}
                      >
                        <Text style={[styles.msgSender, isSystem ? { color: '#4B5563' } : { color: '#E5E7EB' }]}>
                          {msg.sender}
                        </Text>
                        <Text style={[styles.msgText, isSystem ? { color: '#041E42' } : { color: '#FFFFFF' }]}>
                          {msg.text}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.inputRow}>
                  <TextInput 
                    style={styles.chatInput} 
                    placeholder="Type message or status update..." 
                    placeholderTextColor="#8A99AD"
                    value={newMessage}
                    onChangeText={setNewMessage}
                  />
                  <TouchableOpacity style={styles.sendBtn} onPress={() => {
                    if (!newMessage.trim() || !activeChatId) return;
                    const senderName = session?.user?.email?.split('@')[0] || 'User';
                    supabase.from('messages').insert([{ chat_id: activeChatId, sender: senderName, text: newMessage.trim() }]);
                    setNewMessage('');
                  }}>
                    <Text style={styles.sendBtnText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeader}>Active Order Chats</Text>
                
                {activeConversations.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No active chats yet.</Text>
                    <Text style={styles.emptyStateSub}>Select a run from the feed to start an order.</Text>
                  </View>
                ) : (
                  <View style={styles.feedBox}>
                    <ScrollView contentContainerStyle={styles.scrollArea}>
                      {activeConversations.map((conv, index) => (
                        <TouchableOpacity 
                          key={conv.id} 
                          style={[styles.cardItem, index === activeConversations.length - 1 && { borderBottomWidth: 0 }]}
                          onPress={() => setActiveChatId(conv.id)}
                        >
                          <View style={styles.cardRow}>
                            <Text style={styles.restaurantText}>{conv.restaurant}</Text>
                            <Text style={[styles.chatStatusTag, conv.status === 'Completed' && { backgroundColor: '#E2E8F0', color: '#041E42' }]}>{conv.status}</Text>
                          </View>
                          <Text style={styles.locationText}>Deliver to: {conv.delivery_address || 'Georgetown Campus'}</Text>
                          <Text style={styles.lastMsgText}>Items: {conv.order_items || 'Order details inside'}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* --- PAGE 3: MY ACTIVITY PAGE --- */}
        {currentTab === 'activity' && (
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionHeader}>My Activity</Text>

            <View style={styles.activityToggleRow}>
              <TouchableOpacity 
                style={[styles.activityToggleBtn, activitySubTab === 'runs' && styles.activityToggleBtnActive]}
                onPress={() => setActivitySubTab('runs')}
              >
                <Text style={[styles.activityToggleText, activitySubTab === 'runs' && styles.activityToggleTextActive]}>
                  My Runs ({myPostedRuns.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.activityToggleBtn, activitySubTab === 'orders' && styles.activityToggleBtnActive]}
                onPress={() => setActivitySubTab('orders')}
              >
                <Text style={[styles.activityToggleText, activitySubTab === 'orders' && styles.activityToggleTextActive]}>
                  My Orders ({activeConversations.length})
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.feedBox}>
              <ScrollView contentContainerStyle={styles.scrollArea}>
                {activitySubTab === 'runs' ? (
                  myPostedRuns.length === 0 ? (
                    <Text style={styles.emptyStateSub}>You haven't posted any pickup runs yet.</Text>
                  ) : (
                    myPostedRuns.map((run, index) => {
                      const capacity = run.maxCapacity || 2;
                      return (
                        <View key={run.id} style={[styles.cardItem, index === myPostedRuns.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={styles.cardRow}>
                            <Text style={styles.restaurantText}>{run.restaurant}</Text>
                            <Text style={styles.chatStatusTag}>
                              {run.ordersCount >= capacity ? `Full (${capacity}/${capacity})` : `${run.ordersCount || 0}/${capacity} Orders`}
                            </Text>
                          </View>
                          <Text style={styles.locationText}>Dropoff: {run.location}</Text>
                          <Text style={styles.timeText}>Cutoff: {run.cutoff}</Text>
                        </View>
                      );
                    })
                  )
                ) : (
                  activeConversations.length === 0 ? (
                    <Text style={styles.emptyStateSub}>No active order chats for your account.</Text>
                  ) : (
                    activeConversations.map((ord, index) => (
                      <TouchableOpacity 
                        key={ord.id} 
                        style={[styles.cardItem, index === activeConversations.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => {
                          setActiveChatId(ord.id);
                          setCurrentTab('chats');
                        }}
                      >
                        <View style={styles.cardRow}>
                          <Text style={styles.restaurantText}>{ord.restaurant}</Text>
                          <Text style={styles.feeText}>$4.00</Text>
                        </View>
                        <Text style={styles.locationText}>Runner: @{ord.runner_venmo} • Status: {ord.status}</Text>
                        <Text style={styles.lastMsgText}>Tap to view live chat</Text>
                      </TouchableOpacity>
                    ))
                  )
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* BOTTOM NAVIGATION BAR */}
        <View style={styles.navigationBar}>
          <TouchableOpacity style={[styles.navTab, currentTab === 'feed' && styles.navTabActive]} onPress={() => setCurrentTab('feed')}>
            <Text style={[styles.navTabText, currentTab === 'feed' && styles.navTabTextActive]}>Feed</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navTab, currentTab === 'chats' && styles.navTabActive]} onPress={() => setCurrentTab('chats')}>
            <Text style={[styles.navTabText, currentTab === 'chats' && styles.navTabTextActive]}>
              Chats {activeConversations.length > 0 ? `(${activeConversations.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navTab, currentTab === 'activity' && styles.navTabActive]} onPress={() => setCurrentTab('activity')}>
            <Text style={[styles.navTabText, currentTab === 'activity' && styles.navTabTextActive]}>Activity</Text>
          </TouchableOpacity>
        </View>

      </View>

      {/* REPORT MODAL */}
      <Modal visible={reportModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report Issue to Moderation</Text>
            <Text style={styles.modalSub}>Flag non-payment, non-delivery, or unacceptable behavior:</Text>

            <Text style={styles.label}>Reason for Report</Text>
            <TextInput 
              style={[styles.input, { height: 80 }]} 
              placeholder="e.g. Recipient received food at Village A but did not send $4 Venmo payment." 
              placeholderTextColor="#8A99AD"
              multiline={true}
              value={reportReason}
              onChangeText={setReportReason}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setReportModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#EF4444', borderColor: '#EF4444' }]} onPress={handleReportSubmit}>
                <Text style={styles.submitBtnText}>Submit Flag</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SETTINGS MODAL */}
      <Modal visible={settingsModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>User Settings</Text>
            <Text style={styles.modalSub}>Update your account email, password, or Venmo handle:</Text>

            <Text style={styles.label}>Venmo Handle</Text>
            <TextInput style={styles.input} placeholder="@your-venmo" placeholderTextColor="#8A99AD" value={newVenmo} onChangeText={setNewVenmo} />

            <Text style={styles.label}>Account Email (@georgetown.edu only)</Text>
            <TextInput style={styles.input} placeholder="netid@georgetown.edu" placeholderTextColor="#8A99AD" autoCapitalize="none" value={newEmail} onChangeText={setNewEmail} />

            <Text style={styles.label}>New Password (leave blank to keep current)</Text>
            <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#8A99AD" secureTextEntry={true} value={newPassword} onChangeText={setNewPassword} />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setSettingsModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleUpdateSettings}>
                <Text style={styles.submitBtnText}>Save Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RUNNER ENTER PIN MODAL */}
      <Modal visible={pinModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Recipient Delivery PIN</Text>
            <Text style={styles.modalSub}>Ask the recipient for their 4-digit pickup PIN upon handing over the food:</Text>

            <TextInput 
              style={[styles.input, { fontSize: 24, textAlign: 'center', letterSpacing: 8, paddingVertical: 12 }]} 
              placeholder="••••" 
              placeholderTextColor="#8A99AD"
              keyboardType="number-pad"
              maxLength={4}
              value={enteredPin}
              onChangeText={setEnteredPin}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPinModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleVerifyPinSubmit}>
                <Text style={styles.submitBtnText}>Verify PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RUNNER VERIFICATION MODAL */}
      <Modal visible={runnerOnboardingModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Become a Verified Runner</Text>
            <Text style={styles.modalSub}>Complete brief payout setup to start accepting orders and earning money on campus:</Text>

            <View style={styles.ruleBox}>
              <Text style={styles.ruleText}>• Direct bank payouts handled securely by Stripe.</Text>
              <Text style={styles.ruleText}>• If you earn under $400/year in profit across gig work, you typically owe $0 in self-employment taxes.</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setRunnerOnboardingModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleCompleteRunnerOnboarding}>
                <Text style={styles.submitBtnText}>Verify & Enable Runs</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* POST RUN MODAL */}
      <Modal visible={postModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Post a Georgetown Pickup Run</Text>

            <Text style={styles.label}>Restaurant</Text>
            <TextInput style={styles.input} placeholder="e.g. Wisey's, Epicurean, Sweetgreen" placeholderTextColor="#8A99AD" value={restaurant} onChangeText={setRestaurant} />

            <Text style={styles.label}>Campus Dropoff Location (Pin Required)</Text>
            <View style={styles.inputWithBtnRow}>
              <View style={styles.readOnlyPinBox}>
                <Text style={styles.readOnlyPinText}>
                  {dropoff ? `📍 ${dropoff}` : '⚠️ No pin dropped yet'}
                </Text>
              </View>
              <TouchableOpacity style={styles.pinDropBtn} onPress={() => setMapPickerVisible(true)}>
                <Text style={styles.pinDropBtnText}>Drop Pin</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>How many orders will you accept?</Text>
            <View style={styles.radiusContainer}>
              {['1', '2', '3', '5'].map((num) => (
                <TouchableOpacity key={num} style={[styles.radiusOption, maxOrders === num && styles.radiusOptionSelected]} onPress={() => setMaxOrders(num)}>
                  <Text style={[styles.radiusText, maxOrders === num && styles.radiusTextSelected]}>{num} {num === '1' ? 'Order' : 'Orders'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Dropoff Radius Zone</Text>
            <View style={styles.radiusContainer}>
              {['0.25 mi', '0.5 mi', '1.0 mi'].map((r) => (
                <TouchableOpacity key={r} style={[styles.radiusOption, radius === r && styles.radiusOptionSelected]} onPress={() => setRadius(r)}>
                  <Text style={[styles.radiusText, radius === r && styles.radiusTextSelected]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Taking Orders Until</Text>
            <View style={styles.radiusContainer}>
              {['In 15m', 'In 30m', 'In 1h', '11:59 PM'].map((preset) => (
                <TouchableOpacity key={preset} style={[styles.radiusOption, cutoffPreset === preset && styles.radiusOptionSelected]} onPress={() => setCutoffPreset(preset)}>
                  <Text style={[styles.radiusText, cutoffPreset === preset && styles.radiusTextSelected]}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPostModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handlePostRun}>
                <Text style={styles.submitBtnText}>Submit Run</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MAP MODAL */}
      <Modal visible={mapPickerVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: 480, padding: 12 }]}>
            <Text style={styles.modalTitle}>Georgetown Dropoff Map</Text>
            <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              Click or tap anywhere on the map to drop your dropoff pin:
            </Text>
            
            {Platform.OS !== 'web' ? (
              userCoords ? (
                <MapView style={styles.fullMap} initialRegion={userCoords} showsUserLocation={true} onPress={(e) => setDroppedPin(e.nativeEvent.coordinate)}>
                  <Circle center={userCoords} radius={804.672} fillColor="rgba(4, 30, 66, 0.15)" strokeColor="#041E42" />
                  {droppedPin && <Marker coordinate={droppedPin} pinColor="#041E42" />}
                </MapView>
              ) : null
            ) : (
              <View style={styles.webMapSimBox}>
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  srcDoc={webInteractiveMapHtml}
                  style={{ borderRadius: 4, border: '1px solid #041E42' }}
                />
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setMapPickerVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleConfirmPinDrop}>
                <Text style={styles.submitBtnText}>Confirm Location Pin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ORDER MODAL */}
      <Modal visible={orderModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Pickup from {selectedRun?.restaurant}</Text>
              <View style={styles.timerBadge}>
                <Text style={styles.timerText}>⏱️ {Math.floor(holdTimeLeft / 60)}:{holdTimeLeft % 60 < 10 ? '0' : ''}{holdTimeLeft % 60} Hold</Text>
              </View>
            </View>

            <Text style={styles.modalSub}>Spot held for 3 minutes! Place your order at store, then fill details:</Text>

            <Text style={styles.label}>Name on Order (at store)</Text>
            <TextInput style={styles.input} placeholder="e.g. Jack the Bulldog" placeholderTextColor="#8A99AD" value={pickupName} onChangeText={setPickupName} />

            <Text style={styles.label}>Order Ref / Confirmation Number</Text>
            <TextInput style={styles.input} placeholder="e.g. Order #1042" placeholderTextColor="#8A99AD" value={orderRef} onChangeText={setOrderRef} />

            <Text style={styles.label}>Delivery Address / Dorm Building</Text>
            <TextInput style={styles.input} placeholder="e.g. Village A - Apt 204" placeholderTextColor="#8A99AD" value={deliveryAddress} onChangeText={setDeliveryAddress} />

            <Text style={styles.label}>Delivery Instructions / Dropoff Notes</Text>
            <TextInput style={styles.input} placeholder="e.g. Leave on bench outside front lobby, call when 2 mins away" placeholderTextColor="#8A99AD" value={deliveryInstructions} onChangeText={setDeliveryInstructions} />

            <Text style={styles.label}>Brief Description of Items</Text>
            <TextInput style={styles.input} placeholder="e.g. 1 Chicken Sandwich & 1 Iced Coffee" placeholderTextColor="#8A99AD" value={orderDescription} onChangeText={setOrderDescription} />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setOrderModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleSubmitOrderPrompt}>
                <Text style={styles.submitBtnText}>Confirm & Open Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  innerContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 16, justifyContent: 'space-between' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  settingsBtn: { borderBottomWidth: 1, borderBottomColor: '#041E42' },
  settingsBtnText: { color: '#041E42', fontSize: 12, fontWeight: '700' },
  signOutBtn: { borderBottomWidth: 1, borderBottomColor: '#EF4444' },
  signOutText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  authContainer: { flex: 1, paddingHorizontal: 30, justifyContent: 'center' },
  authSubtitle: { fontSize: 14, color: '#4A5568', textAlign: 'center', marginTop: 8, marginBottom: 16 },
  toggleAuthText: { fontSize: 13, fontWeight: '600', color: '#041E42', textAlign: 'center', marginTop: 14 },
  guidelinesCheckRow: { borderBottomWidth: 1, borderBottomColor: '#041E42', paddingVertical: 6, marginBottom: 16, alignItems: 'center' },
  guidelinesCheckText: { fontSize: 12, fontWeight: '700', color: '#041E42' },

  checkboxRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  checkbox: { flex: 1, borderWidth: 1, borderColor: '#041E42', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 2, alignItems: 'center', backgroundColor: '#FFFFFF' },
  checkboxActive: { backgroundColor: '#041E42' },
  checkboxText: { fontSize: 12, fontWeight: '600', color: '#041E42' },
  checkboxTextActive: { color: '#FFFFFF' },

  taxNoteBox: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', padding: 8, borderRadius: 2, marginBottom: 10 },
  taxNoteText: { fontSize: 11, color: '#334155', lineHeight: 15 },

  ruleBox: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 4, marginVertical: 8 },
  ruleText: { fontSize: 12, color: '#1E293B', marginBottom: 8, lineHeight: 16 },

  logoContainer: { alignItems: 'center' },
  logoText: { fontSize: 32, fontWeight: '800', color: '#041E42', letterSpacing: -0.8 },
  logoAccent: { color: '#8A99AD' },
  guTagline: { fontSize: 9, fontWeight: '800', color: '#041E42', letterSpacing: 2, marginTop: -2 },
  logoBar: { height: 3, width: 36, backgroundColor: '#041E42', marginTop: 4, borderRadius: 2 },
  
  locationBanner: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: 6, alignItems: 'center', marginBottom: 6 },
  bannerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bannerText: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  bannerTextSuccess: { fontSize: 11, color: '#041E42', fontWeight: '700' },
  bannerTextError: { fontSize: 11, color: '#EF4444', fontWeight: '700' },

  sectionHeader: { fontSize: 20, fontWeight: '700', color: '#041E42', marginTop: 8, marginBottom: 12 },
  feedBox: { flex: 1, borderWidth: 2, borderColor: '#041E42', borderRadius: 4, padding: 14, marginBottom: 16, backgroundColor: '#FFFFFF' },
  scrollArea: { paddingVertical: 2 },
  cardItem: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: 12, paddingHorizontal: 6 },
  myRunCard: { backgroundColor: '#F1F5F9', borderRadius: 4, marginVertical: 4, paddingHorizontal: 10, borderColor: '#041E42', borderWidth: 1 },
  myRunBadge: { backgroundColor: '#041E42', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  myRunBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restaurantText: { fontSize: 18, fontWeight: '700', color: '#041E42' },
  feeText: { fontSize: 16, fontWeight: '700', color: '#041E42' },
  locationText: { fontSize: 14, color: '#334155', marginTop: 3 },
  timeText: { fontSize: 12, color: '#64748B', marginTop: 2 },

  postButton: { borderWidth: 2, borderColor: '#041E42', paddingVertical: 14, borderRadius: 4, alignItems: 'center', backgroundColor: '#041E42', marginBottom: 12 },
  postButtonText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  inputWithBtnRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  readOnlyPinBox: { flex: 1, borderWidth: 1, borderColor: '#041E42', backgroundColor: '#F1F5F9', padding: 10, borderRadius: 2, justifyContent: 'center' },
  readOnlyPinText: { fontSize: 13, color: '#041E42', fontWeight: '600' },
  pinDropBtn: { backgroundColor: '#041E42', paddingHorizontal: 14, justifyContent: 'center', borderRadius: 2 },
  pinDropBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  fullMap: { flex: 1, marginVertical: 10, borderRadius: 2 },
  webMapSimBox: { flex: 1, marginVertical: 10, borderRadius: 4, overflow: 'hidden' },

  activityToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  activityToggleBtn: { flex: 1, borderWidth: 1, borderColor: '#041E42', paddingVertical: 8, alignItems: 'center', borderRadius: 2, backgroundColor: '#FFFFFF' },
  activityToggleBtnActive: { backgroundColor: '#041E42' },
  activityToggleText: { fontSize: 12, fontWeight: '600', color: '#041E42' },
  activityToggleTextActive: { color: '#FFFFFF' },

  chatContainer: { flex: 1, borderWidth: 2, borderColor: '#041E42', borderRadius: 4, padding: 12, backgroundColor: '#FFFFFF', marginBottom: 12 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 10, marginBottom: 8 },
  chatTitle: { fontSize: 18, fontWeight: '700', color: '#041E42' },
  chatSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  backToListText: { fontSize: 12, fontWeight: '700', color: '#041E42' },
  
  pinHeaderBadge: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignItems: 'center' },
  pinHeaderLabel: { fontSize: 8, fontWeight: '800', color: '#92400E' },
  pinHeaderText: { fontSize: 14, fontWeight: '900', color: '#92400E', letterSpacing: 2 },

  orderDetailsBanner: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', padding: 8, borderRadius: 4, marginBottom: 8 },
  orderDetailsTitle: { fontSize: 11, fontWeight: '700', color: '#1E293B', marginBottom: 2 },
  
  verifyPinBtn: { backgroundColor: '#041E42', paddingVertical: 10, borderRadius: 2, alignItems: 'center', marginBottom: 10 },
  verifyPinBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  messageBox: { flex: 1, marginBottom: 10 },
  messageBubble: { padding: 10, borderRadius: 4, marginBottom: 8, borderWidth: 1 },
  systemBubble: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  userBubble: { backgroundColor: '#8A99AD', borderColor: '#8A99AD', alignSelf: 'flex-end', width: '82%' },
  runnerBubble: { backgroundColor: '#041E42', borderColor: '#041E42', alignSelf: 'flex-start', width: '82%' },
  msgSender: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  msgText: { fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 8 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#041E42', padding: 8, borderRadius: 2, fontSize: 13, color: '#041E42' },
  sendBtn: { backgroundColor: '#041E42', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 2 },
  sendBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 4, padding: 20, marginBottom: 16 },
  emptyStateText: { fontSize: 16, fontWeight: '700', color: '#041E42' },
  emptyStateSub: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'center' },

  navigationBar: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#041E42', paddingTop: 8 },
  navTab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  navTabActive: { backgroundColor: '#F1F5F9', borderRadius: 2 },
  navTabText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  navTabTextActive: { color: '#041E42', fontWeight: '800' },

  timerBadge: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  timerText: { fontSize: 11, fontWeight: '800', color: '#92400E' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#041E42', padding: 20, borderRadius: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#041E42', marginBottom: 6 },
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 3 },
  input: { borderWidth: 1, borderColor: '#041E42', padding: 8, borderRadius: 2, marginBottom: 10, fontSize: 13, color: '#041E42' },
  
  radiusContainer: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  radiusOption: { flex: 1, borderWidth: 1, borderColor: '#041E42', paddingVertical: 6, alignItems: 'center', borderRadius: 2, backgroundColor: '#FFFFFF' },
  radiusOptionSelected: { backgroundColor: '#041E42' },
  radiusText: { fontSize: 12, fontWeight: '600', color: '#041E42' },
  radiusTextSelected: { color: '#FFFFFF' },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#041E42', alignItems: 'center', borderRadius: 2 },
  cancelBtn: { backgroundColor: '#FFFFFF' },
  submitBtn: { backgroundColor: '#041E42', borderColor: '#041E42' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#041E42' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' }
});
