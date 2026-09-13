"use client";

export function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white">
      <div className="absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[130vh] w-[130vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tl from-gray-900 via-purple-900 to-violet-600 w-[200%]" />
      </div>

      <div className="absolute inset-x-0 bottom-[-80]">
        <img src="/lasVegas.png" alt="Las Vegas" className="w-full h-auto block object-bottom"/>
      </div>

      <div className="relative flex flex-col items-center justify-center h-[50vh] font-serif font-extrabold text-8xl text-amber-400">
        <div>FACE</div>
        <div>DOWN</div>
</div>

      {/*1 top right*/}
      <div className="absolute border-none h-60 w-40 top-0 right-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[22.5deg] text-black">
        <img src="/playing-card-diamond-3-svgrepo-com.svg" alt="diamond card" className="h-full w-full object-cover"
        style={{filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)',}}/>
      </div>
      <div className="absolute border-none h-60 w-40 top-0 right-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-45 text-black">
        <img src="/playing-card-clover-3-svgrepo-com.svg" alt="clover card" className="h-full w-full object-cover" />
      </div>
      <div className="absolute border-none h-60 w-40 top-0 right-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[67.5deg] text-black">
        <img src="/playing-card-heart-3-svgrepo-com.svg" alt="heart card" className="h-full w-full object-cover"
        style={{filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)',}} />
      </div>
      

      {/*2 bottom right*/}
      <div className="absolute border-none h-60 w-40 bottom-0 right-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[292.5deg] text-black">
        <img src="/playing-card-spades-three-svgrepo-com.svg" alt="spades card" className="h-full w-full object-cover" />
      </div>
      <div className="absolute border-none h-60 w-40 bottom-0 right-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-315 text-black">
        <img src="/playing-card-heart-3-svgrepo-com.svg" alt="heart card" className="h-full w-full object-cover"
        style={{filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)',}}/>
      </div>
      <div className="absolute border-none h-60 w-40 bottom-0 right-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[337.5deg] text-black">
        <img src="/playing-card-diamond-3-svgrepo-com.svg" alt="diamond card" className="h-full w-full object-cover"
        style={{filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)',}}/>
      </div>

      {/*3 bottom left*/}
      <div className="absolute border-none h-60 w-40 bottom-0 left-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[22.5deg] text-black">
        <img src="/playing-card-clover-3-svgrepo-com.svg" alt="clover card" className="h-full w-full object-cover" />
      </div>
      <div className="absolute border-none h-60 w-40 bottom-0 left-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-45 text-black">
        <img src="/playing-card-spades-three-svgrepo-com.svg" alt="spades card" className="h-full w-full object-cover" />
      </div>
      <div className="absolute border-none h-60 w-40 bottom-0 left-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[67.5deg] text-black">
        <img src="/playing-card-heart-3-svgrepo-com.svg" alt="heart card" className="h-full w-full object-cover"
        style={{filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)',}}/>
      </div>

      {/*4 top left*/}
      <div className="absolute border-none h-60 w-40 top-0 left-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[292.5deg] text-black">
        <img src="/playing-card-diamond-3-svgrepo-com.svg" alt="diamond card" className="h-full w-full object-cover"
        style={{filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)',}}/>
      </div>
      <div className="absolute border-none h-60 w-40 top-0 left-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-315 text-black">
        <img src="/playing-card-clover-3-svgrepo-com.svg" alt="clover card" className="h-full w-full object-cover" />
      </div>
      <div className="absolute border-none h-60 w-40 top-0 left-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[337.5deg] text-black">
        <img src="/playing-card-spades-three-svgrepo-com.svg" alt="spades card" className="h-full w-full object-cover" />
      </div>
    </main>
  );
}