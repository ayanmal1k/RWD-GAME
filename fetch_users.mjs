import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBu-7FCZq75Dwinsh0msPW4JowIGyleWuk',
  authDomain: 'real-climber-ayan-1234.firebaseapp.com',
  projectId: 'real-climber-ayan-1234',
  storageBucket: 'real-climber-ayan-1234.firebasestorage.app',
  messagingSenderId: '1074725311322',
  appId: '1:1074725311322:web:be31c96c45a7da7c1b5963',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fetchUsers() {
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    if (querySnapshot.empty) {
      console.log('No user records found.');
      return;
    }
    querySnapshot.forEach((doc) => {
      console.log(`${doc.id} => ${JSON.stringify(doc.data())}`);
    });
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

fetchUsers();
