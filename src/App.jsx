import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

// Global variables for Firebase configuration.
// Replace with your Firebase Project ID and config.
const appId = "group-formation-app"; 
const firebaseConfig = {
  apiKey: "AIzaSyA17pXm2sxrWplqRa552ny7PoEuS8QoopQ",
  authDomain: "group-formation-app.firebaseapp.com",
  projectId: "group-formation-app",
  storageBucket: "group-formation-app.firebasestorage.app",
  messagingSenderId: "145860747754",
  appId: "1:145860747754:web:9d17e335e8efe42b835293"
};
const initialAuthToken = '';
const App = () => {
  // State variables for Firebase services and user data
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // State variables for app data and UI
  const [groups, setGroups] = useState([]);
  const [soloStudents, setSoloStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

  // Form state for creating a new group
  const [groupForm, setGroupForm] = useState({
    roll1: '', name1: '',
    roll2: '', name2: '',
    roll3: '', name3: '',
    roll4: '', name4: '',
    locked: false,
  });

  // Form state for joining the solo list
  const [soloForm, setSoloForm] = useState({ roll: '', name: '' });

  // State for password-protected deletion
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [itemToDelete, setItemToDelete] = useState(null);

  // UseEffect for initializing Firebase and authenticating the user
  useEffect(() => {
    // Initialize Firebase app if config is available
    if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firestoreAuth = getAuth(app);
      setDb(firestoreDb);
      setAuth(firestoreAuth);

      // Authenticate with the provided custom token
      const authenticate = async () => {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(firestoreAuth, initialAuthToken);
          } else {
            // Sign in anonymously if no custom token is provided
            console.warn("No custom token provided. Signing in anonymously.");
            await firestoreAuth.signInAnonymously(firestoreAuth);
          }
        } catch (e) {
          console.error("Firebase Auth Error:", e);
          setError("Failed to authenticate. Please try again.");
        }
      };
      authenticate();

      // Listen for authentication state changes
      const unsubscribe = onAuthStateChanged(firestoreAuth, (user) => {
        if (user) {
          setUserId(user.uid);
          console.log(`Authenticated user with ID: ${user.uid}`);
        } else {
          setUserId(null);
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } else {
      setError("Firebase configuration is missing.");
    }
  }, []);

  // UseEffect for fetching group data in real-time
  useEffect(() => {
    // Only subscribe to Firestore if authentication is ready and we have a user ID.
    if (isAuthReady && userId && db) {
      setLoading(true);
      setError(null);
      const groupsCollectionRef = collection(db, `artifacts/${appId}/public/data/groups`);
      const soloCollectionRef = collection(db, `artifacts/${appId}/public/data/solo`);

      // Real-time listener for the groups collection
      const unsubscribeGroups = onSnapshot(groupsCollectionRef, (snapshot) => {
        const groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setGroups(groupsData);
        setLoading(false);
      }, (err) => {
        console.error("Firestore Groups Error:", err);
        setError("Failed to fetch groups. Check your permissions.");
        setLoading(false);
      });

      // Real-time listener for the solo students collection
      const unsubscribeSolo = onSnapshot(soloCollectionRef, (snapshot) => {
        const soloData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSoloStudents(soloData);
        setLoading(false);
      }, (err) => {
        console.error("Firestore Solo Error:", err);
        setError("Failed to fetch solo students. Check your permissions.");
        setLoading(false);
      });

      // Cleanup function to detach listeners when the component unmounts
      return () => {
        unsubscribeGroups();
        unsubscribeSolo();
      };
    }
  }, [isAuthReady, userId, db]);

  // Helper function to validate roll number format
  const isValidRollNo = (roll) => {
    // The roll number can be an empty string if it's an optional field
    return roll.trim() === '' || /^[A-Z][0-9]{3}$/.test(roll);
  };

  // Check if a roll number is already taken
  const isRollNumberTaken = async (rollNo) => {
    const allRolls = [
      ...groups.flatMap(g => [g.roll1, g.roll2, g.roll3, g.roll4]),
      ...soloStudents.map(s => s.roll)
    ].filter(r => r && r.trim() !== '');
    return allRolls.includes(rollNo);
  };

  // Handle form input changes
  const handleGroupFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setGroupForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSoloFormChange = (e) => {
    const { name, value } = e.target;
    setSoloForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle new group form submission
  const handleSubmitGroup = async (e) => {
    e.preventDefault();
    setMessage('');
    
    // Filter out empty roll numbers and names to count members
    const groupMembers = [
      { roll: groupForm.roll1, name: groupForm.name1 },
      { roll: groupForm.roll2, name: groupForm.name2 },
      { roll: groupForm.roll3, name: groupForm.name3 },
      { roll: groupForm.roll4, name: groupForm.name4 },
    ].filter(member => member.roll.trim() !== '' && member.name.trim() !== '');

    if (groupMembers.length < 2 || groupMembers.length > 4) {
      setMessage('A group must have between 2 and 4 members.');
      return;
    }

    // Check for roll number format and uniqueness
    for (const member of groupMembers) {
      if (!isValidRollNo(member.roll)) {
        setMessage(`Roll number '${member.roll}' is not in the correct format (e.g., A123).`);
        return;
      }
      if (await isRollNumberTaken(member.roll)) {
        setMessage(`Roll number ${member.roll} is already in a team or on the solo list.`);
        return;
      }
    }
    
    // Validate if locked is checked with less than 3 members
    if (groupForm.locked && groupMembers.length < 3) {
      setMessage('You can only lock teams with 3 or more members.');
      return;
    }
    
    try {
      const groupsCollectionRef = collection(db, `artifacts/${appId}/public/data/groups`);
      await addDoc(groupsCollectionRef, {
        ...groupForm,
        createdAt: new Date(),
        creatorId: userId,
      });
      setMessage('Group submitted successfully!');
      setGroupForm({
        roll1: '', name1: '',
        roll2: '', name2: '',
        roll3: '', name3: '',
        roll4: '', name4: '',
        locked: false,
      });
    } catch (e) {
      console.error("Error adding document: ", e);
      setMessage("Failed to submit group. Please try again.");
    }
  };

  // Handle solo student form submission
  const handleSubmitSolo = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!soloForm.roll || !soloForm.name) {
      setMessage('Please enter both your roll number and name.');
      return;
    }
    
    if (!isValidRollNo(soloForm.roll)) {
      setMessage(`Roll number '${soloForm.roll}' is not in the correct format (e.g., A123).`);
      return;
    }

    if (await isRollNumberTaken(soloForm.roll)) {
      setMessage(`Roll number ${soloForm.roll} is already in a team or on the solo list.`);
      return;
    }

    try {
      const soloCollectionRef = collection(db, `artifacts/${appId}/public/data/solo`);
      await addDoc(soloCollectionRef, {
        ...soloForm,
        createdAt: new Date(),
        creatorId: userId,
      });
      setMessage('You have been added to the solo list.');
      setSoloForm({ roll: '', name: '' });
    } catch (e) {
      console.error("Error adding document: ", e);
      setMessage("Failed to add to solo list. Please try again.");
    }
  };

  // Open the password modal for deletion
  const handleDelete = (collectionName, docId) => {
    setItemToDelete({ collectionName, docId });
    setIsPasswordModalOpen(true);
  };

  // Handle password submission and perform deletion
  const confirmDelete = async () => {
    if (passwordInput === 'Nahi dunga') {
      try {
        const docRef = doc(db, `artifacts/${appId}/public/data/${itemToDelete.collectionName}`, itemToDelete.docId);
        await deleteDoc(docRef);
        setMessage('Entry deleted successfully.');
      } catch (e) {
        console.error("Error deleting document: ", e);
        setMessage("Failed to delete entry.");
      } finally {
        setIsPasswordModalOpen(false);
        setPasswordInput('');
        setItemToDelete(null);
      }
    } else {
      setMessage('Incorrect password. Deletion cancelled.');
      setIsPasswordModalOpen(false);
      setPasswordInput('');
      setItemToDelete(null);
    }
  };

  // Count the number of filled members for form validation and UI
  const filledMembersCount = [
    groupForm.roll1, groupForm.roll2, groupForm.roll3, groupForm.roll4,
  ].filter(roll => roll.trim() !== '').length;


  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 font-sans bg-gray-50 min-h-screen">
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Group Formation Portal</h1>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold text-gray-700">Your User ID (for Admin use)</h2>
        <p className="text-gray-600 break-all">{userId}</p>
      </div>

      {message && (
        <div className="p-4 mb-4 text-center text-sm font-medium text-white bg-blue-500 rounded-lg shadow-sm">
          {message}
        </div>
      )}

      {error && (
        <div className="p-4 mb-4 text-center text-sm font-medium text-white bg-red-500 rounded-lg shadow-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Existing Groups Section */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Existing Groups</h2>
          {loading ? (
            <p>Loading groups...</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {groups.length === 0 ? (
                <p className="text-gray-500">No groups formed yet.</p>
              ) : (
                groups.sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate()).map((group, index) => (
                  <li key={group.id} className="py-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-lg font-semibold text-gray-700">Group No. {index + 1} {group.locked && <span className="text-sm font-normal text-green-500">(Locked)</span>}</p>
                        <ul className="text-sm text-gray-500 mt-2">
                          {group.roll1 && group.name1 && <li>{group.roll1} - {group.name1}</li>}
                          {group.roll2 && group.name2 && <li>{group.roll2} - {group.name2}</li>}
                          {group.roll3 && group.name3 && <li>{group.roll3} - {group.name3}</li>}
                          {group.roll4 && group.name4 && <li>{group.roll4} - {group.name4}</li>}
                        </ul>
                      </div>
                      <button
                        onClick={() => handleDelete('groups', group.id)}
                        className="text-red-500 hover:text-red-700 font-medium text-sm transition duration-150 ease-in-out"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* Solo Students Section */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Solo Students</h2>
          {loading ? (
            <p>Loading solo students...</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {soloStudents.length === 0 ? (
                <p className="text-gray-500">No solo students listed yet.</p>
              ) : (
                soloStudents.map(student => (
                  <li key={student.id} className="flex justify-between items-center py-4">
                    <p className="text-sm text-gray-700"><strong>{student.roll}</strong> - {student.name}</p>
                    <button
                        onClick={() => handleDelete('solo', student.id)}
                        className="text-red-500 hover:text-red-700 font-medium text-sm transition duration-150 ease-in-out"
                      >
                        Delete
                      </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Forms Section */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Create Your Group</h2>
        <form onSubmit={handleSubmitGroup} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">Roll numbers must be in the format `A123` (uppercase letter followed by three digits).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Member 1 */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Member 1</label>
              <input
                type="text"
                name="roll1"
                placeholder="Roll No. (A123)"
                value={groupForm.roll1}
                onChange={handleGroupFormChange}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
              <input
                type="text"
                name="name1"
                placeholder="Name"
                value={groupForm.name1}
                onChange={handleGroupFormChange}
                className="mt-2 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
            </div>
            {/* Member 2 */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Member 2</label>
              <input
                type="text"
                name="roll2"
                placeholder="Roll No. (A123)"
                value={groupForm.roll2}
                onChange={handleGroupFormChange}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
              <input
                type="text"
                name="name2"
                placeholder="Name"
                value={groupForm.name2}
                onChange={handleGroupFormChange}
                className="mt-2 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
            </div>
            {/* Member 3 */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Member 3 (Optional)</label>
              <input
                type="text"
                name="roll3"
                placeholder="Roll No. (A123)"
                value={groupForm.roll3}
                onChange={handleGroupFormChange}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
              <input
                type="text"
                name="name3"
                placeholder="Name"
                value={groupForm.name3}
                onChange={handleGroupFormChange}
                className="mt-2 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
            </div>
            {/* Member 4 */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Member 4 (Optional)</label>
              <input
                type="text"
                name="roll4"
                placeholder="Roll No. (A123)"
                value={groupForm.roll4}
                onChange={handleGroupFormChange}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
              <input
                type="text"
                name="name4"
                placeholder="Name"
                value={groupForm.name4}
                onChange={handleGroupFormChange}
                className="mt-2 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="locked"
              type="checkbox"
              name="locked"
              checked={groupForm.locked}
              onChange={handleGroupFormChange}
              disabled={filledMembersCount < 3}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <label htmlFor="locked" className="text-gray-700">Lock Team (requires 3+ members)</label>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors duration-200"
          >
            Submit Group
          </button>
        </form>
      </div>

      <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Join the Solo List</h2>
        <form onSubmit={handleSubmitSolo} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">Roll number must be in the format `A123` (uppercase letter followed by three digits).</p>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">Your Details</label>
            <input
              type="text"
              name="roll"
              placeholder="Roll No. (A123)"
              value={soloForm.roll}
              onChange={handleSoloFormChange}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
            />
            <input
              type="text"
              name="name"
              placeholder="Name"
              value={soloForm.name}
              onChange={handleSoloFormChange}
              className="mt-2 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors duration-200"
          >
            Add Me to Solo List
          </button>
        </form>
      </div>
      
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Enter Password to Delete</h3>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter password..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setIsPasswordModalOpen(false); setPasswordInput(''); setItemToDelete(null); }}
                className="bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-md hover:bg-gray-400 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="bg-red-500 text-white font-bold py-2 px-4 rounded-md hover:bg-red-600 transition-colors duration-200"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
