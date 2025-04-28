export const Bookshelf = () => {
  return (
    <svg
      viewBox="0 0 512 146"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
    >
      {/* Background */}
      <rect width="512" height="146" fill="#B7E0EB" />

      {/* Shelf */}
      <rect x="50" y="120" width="412" height="15" fill="#6B3F27" rx="2" />

      {/* Books */}
      <g transform="translate(60,20)">
        <rect x="0" y="0" width="30" height="100" fill="#466F9F" rx="2" />
        <rect x="35" y="0" width="28" height="100" fill="#4B8C5D" rx="2" />
        <rect x="68" y="0" width="26" height="100" fill="#E07B61" rx="2" />
        <rect x="98" y="0" width="24" height="100" fill="#5CA5B0" rx="2" />
        <rect x="125" y="0" width="22" height="100" fill="#2F3D4C" rx="2" />
        <rect x="152" y="0" width="30" height="100" fill="#4D7261" rx="2" />

        {/* Book with orange and blue sections */}
        <g>
          <rect x="187" y="0" width="25" height="100" fill="#4D7261" rx="2" />
          <rect x="187" y="30" width="25" height="20" fill="#F3B04D" />
          <rect x="187" y="50" width="25" height="15" fill="#466F9F" />
        </g>

        <rect x="217" y="0" width="26" height="100" fill="#5CA5B0" rx="2" />
        <rect x="247" y="0" width="28" height="100" fill="#466F9F" rx="2" />
        <rect x="280" y="0" width="30" height="100" fill="#E07B61" rx="2" />
      </g>

      {/* Decorative shape on right */}
      <circle cx="490" cy="80" r="30" fill="#FFFFFF" />
    </svg>
  )
}
