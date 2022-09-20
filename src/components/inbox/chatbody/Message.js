export default function Message({ justify, message }) {
    return (
        <li className={`flex justify-${justify}`}>
            <div className="relative max-w-xl px-4 py-2 my-1 mx-1 text-gray-700 rounded shadow">
                <span className="block">{message}</span>
            </div>
        </li>
    );
}
