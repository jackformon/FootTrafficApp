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
  const [droppedPin, setDroppedPin] = useState(null);

  // Form State
  const [restaurant, setRestaurant] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [radius, setRadius] = useState('0.5 mi');
  const [cutoffTime, setCutoffTime] = useState('');

  // Order Details State
  const [selectedRun, setSelectedRun] = useState(null);
  const [pickupName, setPickupName] = useState('');
  const [orderRef, setOrderRef] = useState('');

  // Live Database State
  const [allDropoffs, setAllDropoffs] = useState([]);
  const [activeConversations, setActiveConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // Listen for Auth Session Changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const venmo = session?.user?.user_metadata?.venmo || session?.user?.email?.split('@')[0] || 'User';
      setUserVenmo(venmo);
      setNewVenmo(venmo);
      if (session?.user?.email) setNewEmail(session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      const venmo = session?.user?.user_metadata?.venmo || session?.user?.email?.split('@')[0] || 'User';
      setUserVenmo(venmo);
      setNewVenmo(venmo);
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

  // AUTH ACTIONS
  const handleAuth = async () => {
    if (!authEmail || !authPassword) {
      Alert.alert("Missing Fields", "Please enter your email and password.");
      return;
    }

    setAuthLoading(true);

    if (isSigningUp) {
      if (!userVenmo) {
        Alert.alert("Venmo Required", "Please enter your Venmo handle so runners/recipients can pay you.");
        setAuthLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          data: { venmo: userVenmo.replace('@', '') }
        }
      });

      if (error) Alert.alert("Sign Up Error", error.message);
      else Alert.alert("Account Created", "Your account is ready!");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (error) Alert.alert("Login Error", error.message);
    }

    setAuthLoading(false);
  };

  const handleUpdateSettings = async () => {
    try {
      const updates = {};
      if (newEmail && newEmail !== session?.user?.email) updates.email = newEmail;
      if (newPassword) updates.password = newPassword;
      if (newVenmo) updates.data = { venmo: newVenmo.replace('@', '') };

      const { error } = await supabase.auth.updateUser(updates);

      if (error) {
        Alert.alert("Update Error", error.message);
      } else {
        setUserVenmo(newVenmo.replace('@', ''));
        Alert.alert("Settings Updated", "Your account settings have been saved!");
        setSettingsModalVisible(false);
        setNewPassword('');
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // GPS Verification
  const verifyUserLocation = async () => {
    setIsVerifyingLocation(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      setIsVerifyingLocation(false);
      // Fallback location if permission denied
      setUserCoords({ latitude: 37.78825, longitude: -122.4324, latitudeDelta: 0.012, longitudeDelta: 0.012 });
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

  // FETCH RUNS
  const fetchLiveRuns = async () => {
    const { data: runs, error } = await supabase.from('runs').select('*').order('created_at', { ascending: false });
    if (error || !runs) return;

    const { data: chats } = await supabase.from('chats').select('run_id');

    const runsWithOrderCount = runs.map(run => {
      const runChats = chats ? chats.filter(c => c.run_id === run.id) : [];
      return {
        ...run,
        ordersCount: runChats.length
      };
    });

    setAllDropoffs(runsWithOrderCount);
  };

  // FETCH CHATS
  const fetchLiveChats = async () => {
    const { data, error } = await supabase.from('chats').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setActiveConversations(data);
    }
  };

  const fetchChatMessages = async (chatId) => {
    const { data, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (!error && data) setChatMessages(data);
  };

  // ACCURATE CUTOFF TIME PARSER (Auto-expires past runs)
  const isCutoffPassed = (cutoffStr) => {
    if (!cutoffStr) return false;
    
    const now = new Date();
    const match = cutoffStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return false;

    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3] ? match[3].toUpperCase() : null;

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    const cutoffDate = new Date();
    cutoffDate.setHours(hours, minutes, 0, 0);

    return now > cutoffDate;
  };

  // Filter out expired runs from public feed
  const visibleDropoffs = allDropoffs.filter(run => !isCutoffPassed(run.cutoff));

  // Filter user's specific runs for Activity tab
  const myPostedRuns = allDropoffs.filter(run => run.venmo?.toLowerCase() === userVenmo.toLowerCase().replace('@', ''));

  // ACTION: POST RUN
  const handlePostRun = async () => {
    if (!restaurant || !dropoff) {
      Alert.alert("Missing Information", "Please enter restaurant and set a dropoff location.");
      return;
    }

    const currentVenmo = userVenmo || 'MyVenmo';

    const newRun = {
      restaurant,
      location: dropoff,
      radius: `${radius} radius`,
      cutoff: cutoffTime || '11:59 PM',
      fee: '$4.00',
      venmo: currentVenmo,
      latitude: droppedPin?.latitude || userCoords?.latitude || 37.78825,
      longitude: droppedPin?.longitude || userCoords?.longitude || -122.4324
    };

    const { error } = await supabase.from('runs').insert([newRun]);
    
    if (error) {
      Alert.alert("Error Posting", error.message);
      return;
    }

    setRestaurant('');
    setDropoff('');
    setCutoffTime('');
    setPostModalVisible(false);
    setCurrentTab('feed');
  };

  // ACTION: CREATE ORDER CHAT
  const handleSubmitOrderPrompt = async () => {
    if (!pickupName || !orderRef) {
      Alert.alert("Missing Details", "Please provide Pickup Name and Order Reference #.");
      return;
    }

    const { data: existingChats } = await supabase
      .from('chats')
      .select('id')
      .eq('run_id', selectedRun.id);

    if (existingChats && existingChats.length >= 2) {
      Alert.alert("Run Full", "Sorry! This run has reached its maximum capacity of 2 orders.");
      setOrderModalVisible(false);
      return;
    }

    const newChat = {
      run_id: selectedRun.id,
      restaurant: selectedRun.restaurant,
      runner_venmo: selectedRun.venmo,
      pickup_name: pickupName,
      order_ref: orderRef,
      status: 'Order Placed'
    };

    const { data, error } = await supabase.from('chats').insert([newChat]).select();

    if (error || !data) {
      Alert.alert("Error Creating Order", error?.message);
      return;
    }

    const createdChat = data[0];

    await supabase.from('messages').insert([
      { chat_id: createdChat.id, sender: 'System', text: `Order created for ${selectedRun.restaurant}. Name: "${pickupName}" | Ref: ${orderRef}` },
      { chat_id: createdChat.id, sender: 'System', text: `Prompt: Please send $4.00 to @${selectedRun.venmo} on Venmo.` }
    ]);

    setActiveChatId(createdChat.id);
    setOrderModalVisible(false);
    setPickupName('');
    setOrderRef('');
    setCurrentTab('chats');
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeChatId) return;

    const msgText = newMessage.trim();
    setNewMessage('');

    const senderName = session?.user?.email?.split('@')[0] || 'User';

    await supabase.from('messages').insert([
      { chat_id: activeChatId, sender: senderName, text: msgText }
    ]);
  };

  const handleConfirmPinDrop = () => {
    if (droppedPin) {
      setDropoff(`Pinned: ${droppedPin.latitude.toFixed(4)}, ${droppedPin.longitude.toFixed(4)}`);
    } else {
      setDropoff('Pinned Location (Verified Zone)');
    }
    setMapPickerVisible(false);
  };

  const currentChat = activeConversations.find(c => c.id === activeChatId);

  // --- SHOW AUTH SCREEN IF NOT LOGGED IN ---
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authContainer}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>
              Foot<Text style={styles.logoAccent}>Traffic</Text>
            </Text>
            <View style={styles.logoBar} />
          </View>

          <Text style={styles.authSubtitle}>
            {isSigningUp ? 'Create your account to start running or ordering.' : 'Sign in to access live campus runs.'}
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput 
            style={styles.input} 
            placeholder="student@university.edu" 
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            value={authEmail}
            onChangeText={setAuthEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput 
            style={styles.input} 
            placeholder="••••••••" 
            placeholderTextColor="#9CA3AF"
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
                placeholderTextColor="#9CA3AF"
                value={userVenmo}
                onChangeText={setUserVenmo}
              />
            </>
          )}

          <TouchableOpacity style={styles.postButton} onPress={handleAuth} disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.postButtonText}>{isSigningUp ? 'Sign Up' : 'Log In'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsSigningUp(!isSigningUp)}>
            <Text style={styles.toggleAuthText}>
              {isSigningUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Generate OpenStreetMap URL for Web Embed Map
  const mapLat = droppedPin?.latitude || userCoords?.latitude || 37.78825;
  const mapLng = droppedPin?.longitude || userCoords?.longitude || -122.4324;
  const webMapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapLng - 0.008}%2C${mapLat - 0.008}%2C${mapLng + 0.008}%2C${mapLat + 0.008}&layer=mapnik&marker=${mapLat}%2C${mapLng}`;

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
            <View style={styles.logoBar} />
          </View>

          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)}>
              <Text style={styles.settingsBtnText}>⚙️ Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* LOCATION BANNER */}
        <View style={styles.locationBanner}>
          {isVerifyingLocation ? (
            <View style={styles.bannerRow}>
              <ActivityIndicator size="small" color="#111827" />
              <Text style={styles.bannerText}>Verifying current location...</Text>
            </View>
          ) : locationVerified ? (
            <Text style={styles.bannerTextSuccess}>Verified Location • Signed in as @{userVenmo || session?.user?.email?.split('@')[0]}</Text>
          ) : (
            <TouchableOpacity onPress={verifyUserLocation}>
              <Text style={styles.bannerTextError}>Location Unverified • Tap to retry</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* --- PAGE 1: FEED TAB --- */}
        {currentTab === 'feed' && (
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionHeader}>Dropoffs in my area</Text>

            <View style={styles.feedBox}>
              <ScrollView contentContainerStyle={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {visibleDropoffs.length === 0 ? (
                  <Text style={styles.emptyStateSub}>No active dropoffs nearby. Tap below to post one!</Text>
                ) : (
                  visibleDropoffs.map((item, index) => {
                    const isMyRun = item.venmo?.toLowerCase() === userVenmo?.toLowerCase().replace('@', '');
                    const isFull = item.ordersCount >= 2;

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
                          <Text style={styles.feeText}>{isFull ? 'FULL (2/2)' : item.fee}</Text>
                        </View>
                        <Text style={styles.locationText}>{item.location} • <Text style={{fontWeight: '600'}}>{item.radius}</Text></Text>
                        <Text style={styles.timeText}>
                          {isMyRun ? `Runner: @${item.venmo} (You) • ${item.ordersCount || 0}/2 Spots Filled` : (isFull ? '⚠️ Capacity Reached' : `Taking orders until ${item.cutoff} (${item.ordersCount || 0}/2 spots)`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.postButton} onPress={() => setPostModalVisible(true)}>
              <Text style={styles.postButtonText}>Post a run</Text>
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
                    <Text style={styles.chatSub}>Runner: @{currentChat.runner_venmo} • Status: {currentChat.status}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setActiveChatId(null)}>
                    <Text style={styles.backToListText}>All Chats</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.messageBox} showsVerticalScrollIndicator={false}>
                  {chatMessages.map((msg, index) => (
                    <View 
                      key={`${msg.id}-${index}`} 
                      style={[
                        styles.messageBubble, 
                        msg.sender === 'System' ? styles.systemBubble : (msg.sender === session?.user?.email?.split('@')[0] ? styles.userBubble : styles.runnerBubble)
                      ]}
                    >
                      <Text style={styles.msgSender}>{msg.sender}</Text>
                      <Text style={styles.msgText}>{msg.text}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.inputRow}>
                  <TextInput 
                    style={styles.chatInput} 
                    placeholder="Type message or payment update..." 
                    placeholderTextColor="#9CA3AF"
                    value={newMessage}
                    onChangeText={setNewMessage}
                  />
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
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
                          style={[
                            styles.cardItem, 
                            index === activeConversations.length - 1 && { borderBottomWidth: 0 }
                          ]}
                          onPress={() => setActiveChatId(conv.id)}
                        >
                          <View style={styles.cardRow}>
                            <Text style={styles.restaurantText}>{conv.restaurant}</Text>
                            <Text style={styles.chatStatusTag}>{conv.status}</Text>
                          </View>
                          <Text style={styles.locationText}>Runner: @{conv.runner_venmo} • Ref: {conv.order_ref}</Text>
                          <Text style={styles.lastMsgText}>Tap to open real-time chat thread</Text>
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
                    myPostedRuns.map((run, index) => (
                      <View key={run.id} style={[styles.cardItem, index === myPostedRuns.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={styles.cardRow}>
                          <Text style={styles.restaurantText}>{run.restaurant}</Text>
                          <Text style={styles.chatStatusTag}>
                            {run.ordersCount >= 2 ? 'Full (2/2)' : `${run.ordersCount || 0}/2 Orders`}
                          </Text>
                        </View>
                        <Text style={styles.locationText}>Dropoff: {run.location}</Text>
                        <Text style={styles.timeText}>Cutoff: {run.cutoff}</Text>
                      </View>
                    ))
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

      {/* SETTINGS MODAL */}
      <Modal visible={settingsModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>User Settings</Text>
            <Text style={styles.modalSub}>Update your account email, password, or Venmo handle:</Text>

            <Text style={styles.label}>Venmo Handle</Text>
            <TextInput style={styles.input} placeholder="@your-venmo" placeholderTextColor="#9CA3AF" value={newVenmo} onChangeText={setNewVenmo} />

            <Text style={styles.label}>Account Email</Text>
            <TextInput style={styles.input} placeholder="your-email@edu.com" placeholderTextColor="#9CA3AF" autoCapitalize="none" value={newEmail} onChangeText={setNewEmail} />

            <Text style={styles.label}>New Password (leave blank to keep current)</Text>
            <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#9CA3AF" secureTextEntry={true} value={newPassword} onChangeText={setNewPassword} />

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

      {/* POST RUN MODAL */}
      <Modal visible={postModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Post a Pickup Run</Text>

            <Text style={styles.label}>Restaurant</Text>
            <TextInput style={styles.input} placeholder="e.g. Piazza Pizza" placeholderTextColor="#9CA3AF" value={restaurant} onChangeText={setRestaurant} />

            <Text style={styles.label}>Dropoff Location</Text>
            <View style={styles.inputWithBtnRow}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Drop a pin or type location" placeholderTextColor="#9CA3AF" value={dropoff} onChangeText={setDropoff} />
              <TouchableOpacity style={styles.pinDropBtn} onPress={() => setMapPickerVisible(true)}>
                <Text style={styles.pinDropBtnText}>Drop Pin</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Dropoff Radius Zone</Text>
            <View style={styles.radiusContainer}>
              {['0.25 mi', '0.5 mi', '1.0 mi'].map((r) => (
                <TouchableOpacity key={r} style={[styles.radiusOption, radius === r && styles.radiusOptionSelected]} onPress={() => setRadius(r)}>
                  <Text style={[styles.radiusText, radius === r && styles.radiusTextSelected]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Taking Orders Until (e.g. 8:30 PM)</Text>
            <TextInput style={styles.input} placeholder="e.g. 8:30 PM" placeholderTextColor="#9CA3AF" value={cutoffTime} onChangeText={setCutoffTime} />

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

      {/* MAP MODAL (NATIVE MAPS + WEB INTERACTIVE MAP) */}
      <Modal visible={mapPickerVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: 460, padding: 12 }]}>
            <Text style={styles.modalTitle}>Dropoff Location Map</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
              {Platform.OS === 'web' ? 'Pan/zoom to adjust your dropoff target pin:' : 'Tap map to place dropoff pin:'}
            </Text>
            
            {Platform.OS !== 'web' ? (
              userCoords ? (
                <MapView style={styles.fullMap} initialRegion={userCoords} showsUserLocation={true} onPress={(e) => setDroppedPin(e.nativeEvent.coordinate)}>
                  <Circle center={userCoords} radius={804.672} fillColor="rgba(16, 185, 129, 0.15)" strokeColor="#10B981" />
                  {droppedPin && <Marker coordinate={droppedPin} pinColor="#10B981" />}
                </MapView>
              ) : null
            ) : (
              <View style={styles.webMapSimBox}>
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight="0"
                  marginWidth="0"
                  src={webMapUrl}
                  style={{ borderRadius: 4, border: '1px solid #111827' }}
                />
                <TouchableOpacity 
                  style={styles.simPinActionBtn} 
                  onPress={() => setDroppedPin({ latitude: userCoords?.latitude || 37.788, longitude: userCoords?.longitude || -122.432 })}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>📍 Pin Current Verified Coordinates</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setMapPickerVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleConfirmPinDrop}>
                <Text style={styles.submitBtnText}>Confirm Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ORDER MODAL */}
      <Modal visible={orderModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Pickup from {selectedRun?.restaurant}</Text>
            <Text style={styles.modalSub}>Place your order on the store's app/website first, then enter details:</Text>

            <Text style={styles.label}>Name on Order (at store)</Text>
            <TextInput style={styles.input} placeholder="e.g. Jordan Miller" placeholderTextColor="#9CA3AF" value={pickupName} onChangeText={setPickupName} />

            <Text style={styles.label}>Order Ref / Confirmation Number</Text>
            <TextInput style={styles.input} placeholder="e.g. Order #1042" placeholderTextColor="#9CA3AF" value={orderRef} onChangeText={setOrderRef} />

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
  settingsBtn: { borderBottomWidth: 1, borderBottomColor: '#111827' },
  settingsBtnText: { color: '#111827', fontSize: 12, fontWeight: '700' },
  signOutBtn: { borderBottomWidth: 1, borderBottomColor: '#EF4444' },
  signOutText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  authContainer: { flex: 1, paddingHorizontal: 30, justifyContent: 'center' },
  authSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  toggleAuthText: { fontSize: 13, fontWeight: '600', color: '#10B981', textAlign: 'center', marginTop: 14 },

  logoContainer: { alignItems: 'center' },
  logoText: { fontSize: 32, fontWeight: '800', color: '#111827', letterSpacing: -0.8 },
  logoAccent: { color: '#10B981' },
  logoBar: { height: 3, width: 36, backgroundColor: '#10B981', marginTop: 4, borderRadius: 2 },
  
  locationBanner: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 6, alignItems: 'center', marginBottom: 6 },
  bannerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bannerText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  bannerTextSuccess: { fontSize: 11, color: '#10B981', fontWeight: '700' },
  bannerTextError: { fontSize: 11, color: '#EF4444', fontWeight: '700' },

  sectionHeader: { fontSize: 20, fontWeight: '600', color: '#111827', marginTop: 8, marginBottom: 12 },
  feedBox: { flex: 1, borderWidth: 2, borderColor: '#111827', borderRadius: 4, padding: 14, marginBottom: 16, backgroundColor: '#FFFFFF' },
  scrollArea: { paddingVertical: 2 },
  cardItem: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 12, paddingHorizontal: 6 },
  myRunCard: { backgroundColor: '#F0FDF4', borderRadius: 4, marginVertical: 4, paddingHorizontal: 10, borderColor: '#10B981', borderWidth: 1 },
  myRunBadge: { backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  myRunBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restaurantText: { fontSize: 18, fontWeight: '700', color: '#111827' },
  feeText: { fontSize: 16, fontWeight: '700', color: '#10B981' },
  locationText: { fontSize: 14, color: '#374151', marginTop: 3 },
  timeText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  lastMsgText: { fontSize: 12, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  chatStatusTag: { fontSize: 11, fontWeight: '700', color: '#10B981', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  
  postButton: { borderWidth: 2, borderColor: '#111827', paddingVertical: 14, borderRadius: 4, alignItems: 'center', backgroundColor: '#111827', marginBottom: 12 },
  postButtonText: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },

  activityToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  activityToggleBtn: { flex: 1, borderWidth: 1, borderColor: '#111827', paddingVertical: 8, alignItems: 'center', borderRadius: 2, backgroundColor: '#FFFFFF' },
  activityToggleBtnActive: { backgroundColor: '#111827' },
  activityToggleText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  activityToggleTextActive: { color: '#FFFFFF' },

  inputWithBtnRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pinDropBtn: { backgroundColor: '#111827', paddingHorizontal: 14, justifyContent: 'center', borderRadius: 2 },
  pinDropBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  fullMap: { flex: 1, marginVertical: 10, borderRadius: 2 },
  webMapSimBox: { flex: 1, marginVertical: 10, borderRadius: 4, overflow: 'hidden' },
  simPinActionBtn: { backgroundColor: '#111827', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 2, marginTop: 8, alignItems: 'center' },

  chatContainer: { flex: 1, borderWidth: 2, borderColor: '#111827', borderRadius: 4, padding: 12, backgroundColor: '#FFFFFF', marginBottom: 12 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 10, marginBottom: 10 },
  chatTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  chatSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  backToListText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  messageBox: { flex: 1, marginBottom: 10 },
  messageBubble: { padding: 10, borderRadius: 4, marginBottom: 8, borderWidth: 1 },
  systemBubble: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  userBubble: { backgroundColor: '#10B981', borderColor: '#10B981', alignSelf: 'flex-end', width: '82%' },
  runnerBubble: { backgroundColor: '#111827', borderColor: '#111827', alignSelf: 'flex-start', width: '82%' },
  msgSender: { fontSize: 10, fontWeight: '700', color: '#374151', marginBottom: 2 },
  msgText: { fontSize: 13, color: '#111827' },
  inputRow: { flexDirection: 'row', gap: 8 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#111827', padding: 8, borderRadius: 2, fontSize: 13, color: '#111827' },
  sendBtn: { backgroundColor: '#111827', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 2 },
  sendBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 4, padding: 20, marginBottom: 16 },
  emptyStateText: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptyStateSub: { fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'center' },

  navigationBar: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#111827', paddingTop: 8 },
  navTab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  navTabActive: { backgroundColor: '#F3F4F6', borderRadius: 2 },
  navTabText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  navTabTextActive: { color: '#111827', fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#111827', padding: 20, borderRadius: 4 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 6 },
  modalSub: { fontSize: 12, color: '#6B7280', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#111827', padding: 10, borderRadius: 2, marginBottom: 12, fontSize: 14, color: '#111827' },
  
  radiusContainer: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  radiusOption: { flex: 1, borderWidth: 1, borderColor: '#111827', paddingVertical: 8, alignItems: 'center', borderRadius: 2, backgroundColor: '#FFFFFF' },
  radiusOptionSelected: { backgroundColor: '#111827' },
  radiusText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  radiusTextSelected: { color: '#FFFFFF' },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#111827', alignItems: 'center', borderRadius: 2 },
  cancelBtn: { backgroundColor: '#FFFFFF' },
  submitBtn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' }
});
