import { Outlet } from 'react-router-dom';

/** Shell for /auth/* only — no sidebar, no app chrome */
const AuthLayout = () => <Outlet />;

export default AuthLayout;
