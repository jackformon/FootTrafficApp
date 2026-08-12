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

  // Live Database State
  const [allDropoffs, setAllDropoffs] = useState([]);
  const [activeConversations, setActiveConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [reportReason, setReportReason] = useState('');

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

  // Auth Session Changes
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

  // Handle Post Run Click
  const handleOpenPostRunModal = () => {
    if (!isRunnerOnboarded) {
      setRunnerOnboardingModalVisible(true);
    } else {
      setPostModalVisible(true);
    }
  };

  // Simulate Completing Runner Verification via Free Stripe Standard
  const handleCompleteRunnerOnboarding = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { is_runner_onboarded: true }
      });

      if (error) throw error;

      setIsRunnerOnboarded(true);
      setRunnerOnboardingModalVisible(false);
      Alert.alert("Runner Verified!", "You are now verified to post runs and earn money.");
      setPostModalVisible(true);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  // AUTH ACTIONS
  const handleAuth = async () => {
    if (!authEmail || !authPassword) {
      Alert.alert("Missing Fields", "Please enter your email and password.");
      return;
    }

    setAuthLoading(true);

    if (isSigningUp) {
      if (!authEmail.toLowerCase().trim().endsWith('@georgetown.edu')) {
        Alert.alert("Georgetown Only", "Please sign up using your @georgetown.edu email address.");
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
        Alert.alert("Sign Up Error", error.message);
      } else {
        Alert.alert("Hoya Account Created", "Welcome to FootTraffic Georgetown!");
        if (isRunnerRole) {
          setRunnerOnboardingModalVisible(true);
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (error) Alert.alert("Login Error", error.message);
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

  // --- SHOW AUTH SCREEN IF NOT LOGGED IN ---
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

              {/* ROLE SELECTION CHECKBOXES */}
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
                    ℹ️ <Text style={{fontWeight: '700'}}>Runner Note:</Text> Federal laws require brief payout verification for earn accounts. If you earn under $400 in self-employment income annually, you typically owe $0 in self-employment taxes.
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
                <Text style={styles.ruleText}>3. <Text style={{fontWeight: '700'}}>Verified Dropoffs:</Text> Runners must leave food at the exact specified dorm/location (e.g. Village A, Harbin) and confirm in chat.</Text>
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

  // --- MAIN APP SCREEN ---
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

      {/* RUNNER VERIFICATION PROMPT MODAL */}
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

  navigationBar: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#041E42', paddingTop: 8 },
  navTab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  navTabActive: { backgroundColor: '#F1F5F9', borderRadius: 2 },
  navTabText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  navTabTextActive: { color: '#041E42', fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#041E42', padding: 20, borderRadius: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#041E42', marginBottom: 6 },
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 3 },
  input: { borderWidth: 1, borderColor: '#041E42', padding: 8, borderRadius: 2, marginBottom: 10, fontSize: 13, color: '#041E42' },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#041E42', alignItems: 'center', borderRadius: 2 },
  cancelBtn: { backgroundColor: '#FFFFFF' },
  submitBtn: { backgroundColor: '#041E42', borderColor: '#041E42' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#041E42' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' }
});
