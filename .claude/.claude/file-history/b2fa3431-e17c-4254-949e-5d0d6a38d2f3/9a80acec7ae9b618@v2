import { lazy, Suspense } from 'react'
import './App.css'
import { Routes, Route, BrowserRouter, Navigate} from 'react-router-dom'
import { useAuth } from './Context/useAuth.js';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import ImageNode from './components/HomePage/Editor/nodes/ImageNode.jsx';
import MentionNode from './components/HomePage/Editor/nodes/MentionNode.jsx';
import Loader from './components/loadingComponent/BgLoader.jsx';
import SeoManager from './seo/SeoManager.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

const NotFound = lazy(() => import('./components/NotFound.jsx'));

const AuthModal = lazy(() => import('./components/AuthModal/AuthModal.jsx'));
const HomePage = lazy(() => import('./components/HomePage/Home.jsx'));
const LoginPage = lazy(() => import('./components/LoginPage/login.jsx'));
const SignUp = lazy(() => import('./components/SignUpPage/signup.jsx'));
const MyProfile = lazy(() => import('./components/ProfilePage/MyProfile.jsx'));
const PostCards = lazy(() => import('./components/HomePage/postCards/PostCards.jsx'));
const ContentView = lazy(() => import('./components/HomePage/ContentViewer/ContentView.jsx'));
const Bookmarks = lazy(() => import('./components/Bookmarks/Bookmarks.jsx'));
const Visitprofile = lazy(() => import('./components/VisitProfile/Visitprofile.jsx'));
const ProfilePostCards = lazy(() => import('./components/HomePage/postCards/ProfilePostCards/ProfilePostCards.jsx'));
const ProfileMediaSection = lazy(() => import('./components/ProfilePage/components/ProfileMediaSection.jsx'));
const VisitedProfilePostCards = lazy(() => import('./components/HomePage/postCards/ProfilePostCards/VisitedProfilePostCards.jsx'));
const VisitedProfileMediaSection = lazy(() => import('./components/VisitProfile/components/VisitedProfileMediaSection.jsx'));
const Notifications = lazy(() => import('./components/Notifications/Notifications.jsx'));
const NotificationCards = lazy(() => import('./components/Notifications/notificationsCards.jsx'));
const UnreadNotification = lazy(() => import('./components/Notifications/UnreadNotificationCard.jsx'));
const OpinionsPage = lazy(() => import('./components/SidebarOpinions/OpinionssPage.jsx'));
const VisitedProfileOpinions = lazy(() => import('./components/SidebarOpinions/visitedProfileOpinions.jsx'));
const MyOpinions = lazy(() => import('./components/SidebarOpinions/MyOpinions.jsx'));
const OpinionViewer = lazy(() => import('./components/SidebarOpinions/opinionViewer.jsx'));
const ExplorePage = lazy(() => import('./components/HomePage/explore/ExplorePage.jsx'));
const SettingsPage = lazy(() => import('./components/SettingsPage/SettingsPage.jsx'));
const StoryDashboard = lazy(() => import('./components/Stories/StoryDashboard/StoryDashboard.jsx'));
const StoryEditor = lazy(() => import('./components/Stories/StoryEditor/StoryEditor.jsx'));
const StoryChapterManager = lazy(() => import('./components/Stories/StoryChapterManager/StoryChapterManager.jsx'));
const ChapterEditor = lazy(() => import('./components/Stories/ChapterEditor/ChapterEditor.jsx'));
const StoryBrowser = lazy(() => import('./components/Stories/StoryBrowser/StoryBrowser.jsx'));
const StoryLibrary = lazy(() => import('./components/Stories/StoryLibrary/StoryLibrary.jsx'));
const StoryDetail = lazy(() => import('./components/Stories/StoryDetail/StoryDetail.jsx'));
const ChapterReader = lazy(() => import('./components/Stories/ChapterReader/ChapterReader.jsx'));
const ProfileStoriesSection = lazy(() => import('./components/ProfilePage/components/ProfileStoriesSection.jsx'));
const VisitedProfileStoriesSection = lazy(() => import('./components/VisitProfile/components/VisitedProfileStoriesSection.jsx'));

const editorTheme = {
  paragraph: 'editor-paragraph',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
  },
  quote: 'editor-quote',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
  }
};

const editorConfig = {
  namespace: "MyLexicalEditor",
  theme: editorTheme,
  nodes: [ImageNode, HeadingNode, QuoteNode, MentionNode],
  onError(error){
    throw error;
  },
};

const AppAuthModal = () => {
  const {showAuthModal, closeAuthModal} = useAuth();
  return <AuthModal isOpen={showAuthModal} onClose={closeAuthModal}/>;
}

const AppSplash = () => {
  const { loading } = useAuth();
  return <Loader isLoading={loading} />;
}

const HomeWithEditor = () => (
  <LexicalComposer initialConfig={editorConfig}>
    <HomePage/>
  </LexicalComposer>
);

const SuspenseFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Loader />
  </div>
);

const App = () => {

  return (
    <>
      <BrowserRouter>
        <SeoManager />
        <AppSplash />
        <Suspense fallback={<SuspenseFallback />}>
          <AppAuthModal/>
          <Routes>
            <Route path='/' element={<Navigate to='/home' replace/>}/>
            <Route path='/index.html' element={<Navigate to='/home' replace/>}/>
            <Route path='/profile' element={<ProtectedRoute><MyProfile/></ProtectedRoute>}>
              <Route index element={<ProfilePostCards/>} />
              <Route path='media' element={<ProfileMediaSection/>} />
              <Route path='myOpinions' element={<MyOpinions/>}/>
              <Route path='stories' element={<ProfileStoriesSection/>}/>
            </Route>

            <Route path='/visitProfile' element={<Visitprofile/>}>
              <Route index element={<VisitedProfilePostCards/>}/>
              <Route path='media' element={<VisitedProfileMediaSection/>}/>
              <Route path='visitedOpinions' element={<VisitedProfileOpinions/>}/>
              <Route path='stories' element={<VisitedProfileStoriesSection/>}/>
            </Route>

            <Route path='/u/:username' element={<Visitprofile/>}>
              <Route index element={<VisitedProfilePostCards/>}/>
              <Route path='media' element={<VisitedProfileMediaSection/>}/>
              <Route path='opinions' element={<VisitedProfileOpinions/>}/>
              <Route path='stories' element={<VisitedProfileStoriesSection/>}/>
            </Route>

            <Route path='/home' element={<HomeWithEditor/>}>
              <Route index element={<PostCards/>}/>
              <Route path='following' element={<PostCards/>}/>
              <Route path='for-you' element={<PostCards/>}/>
              <Route path='explore' element={<ExplorePage/>}/>
              <Route path='contentViewer' element={<ContentView/>}/>
              <Route path='post/:journalId' element={<ContentView/>}/>
              <Route path='post/:journalId/:slug' element={<ContentView/>}/>
              <Route path='bookmark' element={<Bookmarks/>}/>
              <Route path='opinions'element={<OpinionsPage/>}/>
              <Route path='opinionsViewer' element={<OpinionViewer/>}/>

              <Route path='settings' element={<SettingsPage/>}/>

              {/* Stories routes */}
              <Route path='stories' element={<StoryBrowser/>}/>
              <Route path='stories/library' element={<StoryLibrary/>}/>
              <Route path='stories/dashboard' element={<StoryDashboard/>}/>
              <Route path='stories/new' element={<StoryEditor/>}/>
              <Route path='stories/:storyId' element={<StoryDetail/>}/>
              <Route path='stories/:storyId/edit' element={<StoryEditor/>}/>
              <Route path='stories/:storyId/manage' element={<StoryChapterManager/>}/>
              <Route path='stories/:storyId/chapter/:chapterId' element={<ChapterReader/>}/>
              <Route path='stories/:storyId/chapter/:chapterId/edit' element={<ChapterEditor/>}/>

              {/* route for nested notifications */}
              <Route path='notifications' element={<Notifications/>}>
                <Route index element={<NotificationCards/>}/>
                <Route path='unreadNotification' element={<UnreadNotification/>}/>
              </Route>
            </Route>

            <Route path='/login' element={<LoginPage/>}/>
            <Route path='/signUp' element={<SignUp/>}/>
            <Route path='*' element={<NotFound/>}/>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  )
}

export default App
