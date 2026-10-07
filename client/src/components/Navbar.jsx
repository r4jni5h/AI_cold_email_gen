import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';

const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const mobileLink = ({ isActive }) =>
        `text-sm font-medium ${isActive ? 'text-primary-700' : 'text-gray-600'}`;

    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
            <div className="text-lg font-medium text-gray-800 hidden md:block">
                Welcome back, {user?.name || 'User'}
            </div>
            {/* Mobile title + nav (sidebar is hidden on mobile) */}
            <div className="flex items-center gap-4 md:hidden">
                <span className="text-lg font-bold text-primary-600">MailGen AI</span>
                <NavLink to="/dashboard" className={mobileLink}>Dashboard</NavLink>
                <NavLink to="/history" className={mobileLink}>History</NavLink>
            </div>

            <div className="flex items-center space-x-4">
                <button
                    onClick={handleLogout}
                    className="flex items-center text-gray-600 hover:text-red-500 transition-colors"
                >
                    <ArrowLeftOnRectangleIcon className="w-5 h-5 mr-1" />
                    <span className="text-sm font-medium">Logout</span>
                </button>
            </div>
        </header>
    );
};

export default Navbar;
